# OutfitChecker — Plan d'action MVP

> Document de cadrage. Aucune ligne de code applicatif n'est encore écrite.

---

## 1. Décisions actées

| Sujet | Décision |
|---|---|
| Utilisateurs | Mono-utilisateur, usage personnel. Pas d'authentification. |
| Stack | Next.js (App Router, TypeScript) |
| Hébergement | **100 % local, localhost uniquement.** Aucun service externe. |
| Persistance | **SQLite** (`better-sqlite3` + Drizzle) + **images sur le disque** |
| Accès IA | **CLI Claude Code en mode headless**, invoqué par un worker local, via l'abonnement |
| Import boutique | Lecture des métadonnées Open Graph / JSON-LD + formulaire de validation |
| Détourage | `@imgly/background-removal`, exécuté **dans le navigateur** (gratuit, sans quota) |
| Visualisation | L'app produit **deux variantes de prompt** + un **pack d'images numéroté**, à utiliser manuellement dans ChatGPT et Gemini |
| Générateurs cibles | **GPT Image** (ChatGPT) et **Nano Banana** (Gemini) |
| Mannequin | **Fiche de profil structurée** (taille, poids, morphotype…), pas de photo de l'utilisateur |
| OutfitCopy | Analyse de l'image de référence → **matching dans la garde-robe réelle** |
| Séquençage | Socle → Analyse IA → Composition d'outfits → OutfitCopy |

### Critères de tri/filtre retenus

- **Base** : catégorie, sous-catégorie, couleur, marque, taille, saison
- **Style et occasion** : registre stylistique, occasions adaptées
- **Détail textile** : matière, coupe, motif

> Volontairement **hors périmètre MVP** : suivi d'usage (nombre de portés, état
> propre/sale, disponibilité). Le schéma laisse la place pour les ajouter plus tard.

---

## 2. Architecture technique

### 2.1 Vue d'ensemble

Tout tient sur une seule machine, sans aucune dépendance réseau hors du scraping
des fiches produit.

```
┌─────────────────────────────────────────────────────────────┐
│  Navigateur (localhost:3000)                                │
│  · UI Next.js          · Détourage @imgly (100 % client)    │
└───────────────┬─────────────────────────────────────────────┘
                │ HTTP
┌───────────────▼─────────────────────────────────────────────┐
│  Serveur Next.js (local)                                    │
│  · Server Actions / Route Handlers                          │
│  · Scraping des métadonnées boutique                        │
│  · Sert les images depuis ./data/images                     │
│  · Écrit les jobs IA dans la file d'attente                 │
└───────────────┬─────────────────────────────────────────────┘
                │
     ┌──────────┴──────────┐      ┌──────────────────────────┐
     │  ./data/app.db      │      │  Worker IA (local)       │
     │  ./data/images/     │◄────►│  · dépile jobs_ia        │
     │  (SQLite + disque)  │      │  · spawn `claude -p`     │
     └─────────────────────┘      └──────────┬───────────────┘
                                             │ sous-processus
                                  ┌──────────▼───────────────┐
                                  │  Claude Code CLI         │
                                  │  (auth = abonnement)     │
                                  └──────────────────────────┘
```

Tout l'état de l'application vit dans **un seul dossier `./data/`** : la base et
les images. Le sauvegarder, c'est sauvegarder l'app entière.

### 2.2 Stockage des images

Les fichiers vont dans `./data/images/`, **hors de `public/`**, et sont servis par
un route handler `/api/images/[id]`. Une quinzaine de lignes.

> Pourquoi pas `public/` directement ? Next.js y sert des fichiers statiques
> connus au build. Des images ajoutées à l'exécution s'y comportent différemment
> entre `next dev` et `next start`. Le route handler lit le disque à chaque
> requête : comportement identique partout, et ça permet d'ajouter plus tard un
> redimensionnement à la volée.

Pour chaque vêtement, deux fichiers : l'original et la version détourée.

### 2.3 Pourquoi un worker séparé

Le CLI met **plusieurs secondes** par appel (démarrage de processus + inférence).
Le faire dans une requête HTTP bloquerait l'interface à chaque ajout de vêtement.

Le worker est un simple process Node dans le même dépôt :

1. Il interroge la table `jobs_ia` toutes les ~2 s (`statut = 'en_attente'`).
2. Il lance `claude -p --output-format json` en lui passant le chemin de l'image
   sur le disque — aucun téléchargement nécessaire, tout est local.
3. Il valide la sortie avec Zod, puis écrit le résultat en base.
4. En cas d'échec : 3 tentatives avec backoff exponentiel, puis `statut = 'echec'`.

Lancement en une commande : `npm run dev` démarre Next.js **et** le worker
(via `concurrently`).

> **Attention SQLite** : deux processus écrivent dans la même base. Activer le
> mode **WAL** (`PRAGMA journal_mode = WAL`) dès l'ouverture, sans quoi des
> erreurs `database is locked` apparaîtront. Une ligne, mais indispensable.

### 2.4 Gestion du quota d'abonnement

L'abonnement fonctionne par fenêtres d'usage glissantes, pas à la facturation.
Analyser 50 vêtements d'un coup peut atteindre le plafond.

Le worker doit donc :

- traiter les jobs **un par un**, jamais en parallèle ;
- détecter un refus pour cause de limite atteinte dans la sortie du CLI ;
- dans ce cas, se mettre en pause (et non marquer le job en échec) et réessayer
  plus tard, en affichant l'état dans l'UI (« file en pause, quota atteint »).

### 2.5 Abstraction de l'accès IA

Toute la logique IA passe par **une seule interface**, dans `lib/ai/types.ts` :

```ts
interface FournisseurIA {
  analyserVetement(cheminImage: string, contexte?: string): Promise<AttributsVetement>
  suggererOutfits(garderobe: VetementResume[], contrainte: ContrainteOutfit): Promise<OutfitSuggere[]>
  analyserImageReference(cheminImage: string): Promise<TenueDeReference>
}
```

Une seule implémentation au départ : `lib/ai/cli.ts` (sous-processus `claude`).
Si un jour une clé API devient préférable, c'est **un fichier à ajouter**, rien
d'autre à modifier dans l'application.

### 2.6 Dépendances — ne rien réinventer

| Besoin | Librairie | Pourquoi |
|---|---|---|
| Base de données | `better-sqlite3` + `drizzle-orm` | Zéro installation, zéro serveur, un seul fichier |
| Composants UI | Tailwind seul | `shadcn/ui` a été écarté : l'interface du lot 1 (grille, formulaires) tient en quelques composants, et une CLI de génération en plus n'apportait rien |
| Validation | `zod` | Valide les formulaires, et au lot 2 les sorties JSON du LLM |
| Détourage | `@imgly/background-removal` | Tourne dans le navigateur, gratuit, sans quota ni clé |
| Scraping métadonnées | `cheerio` | ~40 lignes suffisent pour lire OG + JSON-LD |
| Pack d'images (lot 3) | `jszip` | Un ZIP numéroté, généré côté client |
| Orchestration dev (lot 2) | `concurrently` | Une commande pour app + worker |

> **Une réserve sur le « 100 % local »** : `@imgly/background-removal` télécharge
> son modèle depuis un CDN au premier détourage, puis le navigateur le met en
> cache. C'est le seul appel réseau de l'app en dehors du scraping. Le paquet
> `@imgly/background-removal-data` (~220 Mo) permet de le servir localement —
> procédure dans le README, non activée par défaut vu le poids.

---

## 3. Modèle de données

> SQLite n'a pas de type tableau. Les champs multivalués (`styles`, `occasions`,
> `saisons`, `couleurs_secondaires`) sont stockés en **colonnes JSON**.
> **Le filtrage se fait côté client** : à l'échelle d'une garde-robe personnelle
> (quelques centaines de pièces), on charge tout une fois et on filtre en
> mémoire. C'est instantané et ça supprime toute requête complexe.

### `profil` — une seule ligne

| Champ | Type | Note |
|---|---|---|
| `taille_cm` | int | |
| `poids_kg` | int | |
| `morphotype` | text | ex. « athlétique », « longiligne » |
| `genre_presentation` | text | pour la formulation du prompt |
| `teint`, `cheveux` | text | cohérence visuelle du rendu |
| `pointure` | int | |
| `notes_style` | text | préférences libres, injectées dans les prompts |

### `vetements`

| Champ | Type | Origine |
|---|---|---|
| `id`, `created_at` | text (uuid), int | |
| `nom` | text | saisi ou scrapé |
| `categorie` | text | `haut`, `bas`, `robe`, `outerwear`, `chaussures`, `accessoire` |
| `sous_categorie` | text | « chemise oxford », « chino »… (IA) |
| `marque`, `taille`, `prix` | text, text, real | scrapé ou saisi |
| `url_source`, `boutique` | text | si import URL |
| `couleur_principale`, `couleur_hex` | text | IA |
| `couleurs_secondaires` | json | IA |
| `matiere`, `coupe`, `motif` | text | IA |
| `styles` | json | IA — casual, formel, streetwear, sport… |
| `occasions` | json | IA — bureau, soirée, week-end, sport |
| `saisons` | json | IA |
| `image_fichier` | text | nom du fichier dans `./data/images/` |
| `image_detouree_fichier` | text | idem, produit côté navigateur |
| `description_prompt` | text | **phrase dense rédigée par l'IA**, réutilisée dans les prompts de génération |
| `attributs_bruts` | json | sortie IA complète, pour ne rien perdre |
| `statut_analyse` | text | `en_attente`, `en_cours`, `ok`, `echec` |

### `outfits`

`id`, `nom`, `created_at`, `occasion`, `saison`, `note`,
`source` (`manuel` \| `suggestion_ia` \| `outfitcopy`),
**`prompts` (json)** — voir §4.5, une entrée par générateur cible,
`image_rendu_fichier` (nullable — l'image que tu réimportes après génération),
`reference_image_fichier` (nullable — l'image source OutfitCopy).

### `outfit_vetements`

Table de liaison : `outfit_id`, `vetement_id`, `role`, **`ordre`**.

> `ordre` n'est pas cosmétique : il détermine la numérotation du pack d'images
> et doit correspondre aux références « image 1, image 2… » du prompt instructionnel.

### `jobs_ia`

`id`, `type` (`analyse_vetement` \| `suggestion_outfit` \| `outfitcopy`),
`payload` json, `statut`, `tentatives`, `erreur`, `resultat` json, `created_at`.

---

## 4. Les features, flux par flux

### 4.1 Ajouter un vêtement depuis une URL

1. Tu colles l'URL du produit.
2. Le serveur récupère le HTML et lit, dans cet ordre :
   - le JSON-LD `schema.org/Product` (nom, marque, prix, image) — le plus fiable ;
   - à défaut, les balises Open Graph (`og:title`, `og:image`, `og:price:amount`).
3. Un formulaire pré-rempli s'affiche. **Tu valides ou corriges.**
4. L'image est téléchargée dans `./data/images/`, un job `analyse_vetement` est créé.

> **Repli assumé** : certaines boutiques bloquent les requêtes automatisées
> (Cloudflare, anti-bot). Dans ce cas le formulaire s'ouvre vide avec un champ
> d'upload de photo — le parcours n'est jamais bloqué.

### 4.2 Analyse IA d'un vêtement

Le worker envoie l'image au CLI avec un prompt demandant un JSON strict :
catégorie, sous-catégorie, couleurs, matière, coupe, motif, styles, occasions,
saisons, et surtout une **`description_prompt`** — une phrase visuelle dense,
du type :

> « chemise oxford en coton épais bleu ciel, coupe droite, col boutonné,
>   poche poitrine, manches longues »

C'est elle qui sera réinjectée dans les prompts de génération d'image. Elle doit
être rédigée **pour un générateur d'image**, pas pour un humain. C'est la pièce
centrale de toute la chaîne : mal calibrée, le reste s'effondre.

### 4.3 Parcourir, trier, filtrer

Grille de vignettes (photo détourée si disponible). Filtres combinables sur tous
les champs de la section 1, appliqués en mémoire côté client. État des filtres
stocké dans l'URL pour garder un lien en favori. Tri par date, couleur, marque.

### 4.4 Composer un outfit

Deux chemins :

- **Manuel** : tu sélectionnes des pièces dans la garde-robe.
- **Assisté** : tu donnes une contrainte (« bureau, automne, plutôt sobre »),
  l'app envoie à l'IA la garde-robe **résumée en texte** (pas les images — les
  descriptions suffisent et c'est bien plus rapide) et récupère 2-3 combinaisons
  d'`id` réels, avec une justification courte.

### 4.5 Générer la visualisation — deux cibles, deux prompts

Tu utilises **GPT Image (ChatGPT)** et **Nano Banana (Gemini)**. Ces deux modèles
ne réagissent pas au même style de prompt, donc l'app en génère **deux variantes**
depuis le même outfit, présentées côte à côte avec un bouton « Copier » chacune.

#### Variante A — Nano Banana (Gemini) : prompt instructionnel

Nano Banana est fort en composition multi-images. On lui parle comme à un
monteur, en référençant explicitement les fichiers joints :

> « À partir des images fournies, génère une photo plein pied d'un mannequin
>   [profil]. Habille-le avec : la chemise de l'image 1, le pantalon de
>   l'image 2, les chaussures de l'image 3. Conserve fidèlement la couleur, la
>   matière et la coupe de chaque pièce. Fond gris neutre, lumière studio,
>   photoréaliste. »

La numérotation vient du champ `ordre` de `outfit_vetements`.

#### Variante B — GPT Image (ChatGPT) : prompt descriptif

GPT Image suit mieux une description de scène complète et s'appuie davantage sur
le texte, même avec des références attachées. On déroule donc intégralement les
`description_prompt` :

> « Photographie de mode plein pied, photoréaliste. Sujet : [profil détaillé].
>   Tenue : chemise oxford en coton épais bleu ciel, coupe droite, col
>   boutonné ; chino beige coupe droite en coton ; derbies en cuir marron.
>   Fond gris neutre, lumière studio douce, cadrage vertical. »

#### Le pack d'images

Un bouton **« Télécharger le pack »** produit un ZIP côté client contenant les
photos **détourées** des pièces, nommées `1-chemise.png`, `2-chino.png`… —
numérotation alignée sur la variante A. Tu glisses ces fichiers dans ChatGPT ou
Gemini avec le prompt.

C'est ce qui permet au générateur de voir **tes vrais vêtements** plutôt que des
équivalents génériques.

#### Le retour

Un champ de réimport : tu récupères l'image générée, tu l'attaches à l'outfit,
qui devient consultable dans l'app. Les prompts restent stockés et **éditables** —
tu peux les retoucher, régénérer, comparer les deux générateurs sur le même outfit.

### 4.6 OutfitCopy

1. Tu uploades l'image d'une personne ou d'un personnage.
2. L'IA décompose la tenue portée : pièces, couleurs, coupes, matières perçues,
   registre stylistique d'ensemble.
3. L'app envoie cette décomposition **+ ta garde-robe résumée** à l'IA, qui
   propose 2-3 combinaisons réelles classées par proximité, chacune justifiée
   (« ce pull beige reprend le camaïeu neutre et la coupe ample »).
4. Chaque proposition est convertible en outfit enregistré, donc en prompts de
   génération d'image (4.5).

---

## 5. Séquençage

### Lot 1 — Socle (aucune IA) — ✅ livré

Projet Next.js, SQLite + Drizzle, dossier `./data/`, route handler d'images.
Ajout manuel de vêtement avec photo. Détourage navigateur. Fiche vêtement,
grille, filtres, tri. Fiche de profil. Import URL (scraping + formulaire).

**Critère de sortie** : la garde-robe est saisissable et navigable de bout en bout.

### Lot 2 — Chaîne IA

Adaptateur CLI + worker + table `jobs_ia` + mode WAL. Prompt d'analyse de
vêtement, validation Zod. Affichage du statut d'analyse et relance manuelle.
Gestion du quota.

**Critère de sortie** : ajouter un vêtement remplit automatiquement ses attributs.

### Lot 3 — Outfits et visualisation

Composition manuelle, composition assistée par IA, génération des **deux**
variantes de prompt, export du pack ZIP numéroté, réimport du rendu.

**Critère de sortie** : un outfit produit deux prompts directement exploitables
dans ChatGPT et Gemini.

### Lot 4 — OutfitCopy

Upload de référence, analyse, matching, conversion en outfit.

**Critère de sortie** : une image de référence donne des tenues réelles.

---

## 6. Risques identifiés

| Risque | Gravité | Parade |
|---|---|---|
| Calibrage des prompts de génération | **Élevée** | C'est le cœur du produit. Itérer tôt et sur du réel dès le lot 3, sur les deux générateurs en parallèle |
| Boutiques protégées contre le scraping | Moyenne | Repli systématique sur la saisie manuelle + upload photo |
| Quota d'abonnement atteint en lot | Moyenne | File séquentielle, pause et reprise, état visible dans l'UI |
| Verrou SQLite entre app et worker | Moyenne | Mode WAL activé dès l'ouverture de la base |
| JSON malformé renvoyé par le LLM | Faible | Validation Zod + une relance automatique, puis échec explicite |
| Détourage de qualité inégale | Faible | Photo d'origine conservée ; détourage toujours optionnel |
| Fidélité du rendu généré | Moyenne | Images de référence fournies au générateur, prompts éditables |
| L'app dépend d'une machine allumée | Assumée | Choix explicite du 100 % local |

---

## 7. Hors périmètre, assumé

Ces points sont **écartés pour ce MVP**, par décision explicite :

- Aucune authentification — l'app n'écoute que sur `localhost`.
- Aucun accès mobile, aucun tunnel, aucun déploiement.
- Aucun service externe : pas de base hébergée, pas de stockage cloud,
  pas de clé API.
- Aucun appel automatisé aux générateurs d'image : le passage par ChatGPT et
  Gemini reste manuel.
