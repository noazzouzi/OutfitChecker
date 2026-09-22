# OutfitChecker — Plan d'action MVP

> Document de cadrage. Aucune ligne de code applicatif n'est encore écrite.
> Toutes les décisions ci-dessous ont été arbitrées en amont ; la section
> « Points encore ouverts » liste ce qui reste à trancher.

---

## 1. Décisions actées

| Sujet | Décision |
|---|---|
| Utilisateurs | Mono-utilisateur, usage personnel. Pas d'inscription, pas de multi-tenant. |
| Stack | Next.js (App Router, TypeScript) + Supabase (Postgres + Storage) |
| Hébergement | **100 % local** — l'app tourne sur la machine perso, sur `localhost` |
| Accès IA | **CLI Claude Code en mode headless**, invoqué par un worker local, via l'abonnement |
| Import boutique | Lecture des métadonnées Open Graph / JSON-LD + formulaire de validation |
| Détourage | `@imgly/background-removal`, exécuté **dans le navigateur** (gratuit, sans quota) |
| Visualisation | L'app **produit un prompt + un pack d'images de référence**, à coller/glisser manuellement dans un générateur d'image externe |
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
│  · Écrit les jobs IA dans la file d'attente                 │
└───────────────┬─────────────────────────────────────────────┘
                │
┌───────────────▼──────────┐      ┌──────────────────────────┐
│  Supabase (hébergé)      │      │  Worker IA (local)       │
│  · Postgres              │◄────►│  · dépile jobs_ia        │
│  · Storage (images)      │      │  · spawn `claude -p`     │
└──────────────────────────┘      └──────────┬───────────────┘
                                             │ sous-processus
                                  ┌──────────▼───────────────┐
                                  │  Claude Code CLI         │
                                  │  (auth = abonnement)     │
                                  └──────────────────────────┘
```

### 2.2 Pourquoi un worker séparé

Le CLI met **plusieurs secondes** par appel (démarrage de processus + inférence).
Le faire dans une requête HTTP bloquerait l'interface à chaque ajout de vêtement.

Le worker est un simple process Node dans le même dépôt :

1. Il interroge la table `jobs_ia` toutes les ~2 s (`statut = 'en_attente'`).
2. Il télécharge l'image depuis Supabase Storage vers un dossier temporaire.
3. Il lance `claude -p --output-format json` en lui passant le chemin du fichier.
4. Il valide la sortie avec Zod, puis écrit le résultat en base.
5. En cas d'échec : 3 tentatives avec backoff exponentiel, puis `statut = 'echec'`.

Lancement en une commande : `npm run dev` démarre Next.js **et** le worker
(via `concurrently`).

### 2.3 Gestion du quota d'abonnement

L'abonnement fonctionne par fenêtres d'usage glissantes, pas à la facturation.
Analyser 50 vêtements d'un coup peut atteindre le plafond.

Le worker doit donc :

- traiter les jobs **un par un**, jamais en parallèle ;
- détecter un refus pour cause de limite atteinte dans la sortie du CLI ;
- dans ce cas, se mettre en pause (et non marquer le job en échec) et réessayer
  plus tard, en affichant l'état dans l'UI (« file en pause, quota atteint »).

### 2.4 Abstraction de l'accès IA

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

### 2.5 Dépendances — ne rien réinventer

| Besoin | Librairie | Pourquoi |
|---|---|---|
| Composants UI | `shadcn/ui` + Tailwind | Composants prêts, copiés dans le repo, modifiables |
| Validation des sorties IA | `zod` | Un LLM peut renvoyer du JSON malformé : on valide systématiquement |
| Détourage | `@imgly/background-removal` | Tourne dans le navigateur, gratuit, sans quota ni clé |
| Scraping métadonnées | `cheerio` | ~40 lignes suffisent pour lire OG + JSON-LD ; pas besoin d'un framework |
| Orchestration dev | `concurrently` | Une commande pour app + worker |
| Base / stockage / upload | `@supabase/supabase-js` | Évite d'écrire une couche d'upload et de service d'images |

---

## 3. Modèle de données

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
| `id`, `created_at` | uuid, timestamptz | |
| `nom` | text | saisi ou scrapé |
| `categorie` | enum | `haut`, `bas`, `robe`, `outerwear`, `chaussures`, `accessoire` |
| `sous_categorie` | text | « chemise oxford », « chino »… (IA) |
| `marque`, `taille`, `prix` | text, text, numeric | scrapé ou saisi |
| `url_source`, `boutique` | text | si import URL |
| `couleur_principale`, `couleur_hex` | text | IA |
| `couleurs_secondaires` | text[] | IA |
| `matiere`, `coupe`, `motif` | text | IA |
| `styles` | text[] | IA — casual, formel, streetwear, sport… |
| `occasions` | text[] | IA — bureau, soirée, week-end, sport |
| `saisons` | text[] | IA |
| `photo_url` | text | Supabase Storage |
| `photo_detouree_url` | text | Storage, produit côté navigateur |
| `description_prompt` | text | **phrase dense rédigée par l'IA**, réutilisée telle quelle dans le prompt de génération d'image |
| `attributs_bruts` | jsonb | sortie IA complète, pour ne rien perdre |
| `statut_analyse` | enum | `en_attente`, `en_cours`, `ok`, `echec` |

### `outfits`

`id`, `nom`, `created_at`, `occasion`, `saison`, `note`,
`source` (`manuel` \| `suggestion_ia` \| `outfitcopy`),
`prompt_genere` (text), `image_rendu_url` (nullable — l'image que tu réimportes
après génération externe), `reference_image_url` (nullable — l'image source OutfitCopy).

### `outfit_vetements`

Table de liaison : `outfit_id`, `vetement_id`, `role`.

### `jobs_ia`

`id`, `type` (`analyse_vetement` \| `suggestion_outfit` \| `outfitcopy`),
`payload` jsonb, `statut`, `tentatives`, `erreur`, `resultat` jsonb, `created_at`.

---

## 4. Les features, flux par flux

### 4.1 Ajouter un vêtement depuis une URL

1. Tu colles l'URL du produit.
2. Le serveur récupère le HTML et lit, dans cet ordre :
   - le JSON-LD `schema.org/Product` (nom, marque, prix, image) — le plus fiable ;
   - à défaut, les balises Open Graph (`og:title`, `og:image`, `og:price:amount`).
3. Un formulaire pré-rempli s'affiche. **Tu valides ou corriges.**
4. L'image est téléchargée dans Supabase Storage, un job `analyse_vetement` est créé.

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

C'est cette phrase qui sera réinjectée plus tard dans le prompt de génération
d'image. Elle doit être rédigée pour un générateur d'image, pas pour un humain.

### 4.3 Parcourir, trier, filtrer

Grille de vignettes (photo détourée si disponible). Filtres combinables sur tous
les champs de la section 1, état des filtres stocké dans l'URL pour pouvoir
garder un lien en favori. Tri par date d'ajout, couleur, marque.

### 4.4 Composer un outfit

Deux chemins :

- **Manuel** : tu sélectionnes des pièces dans la garde-robe.
- **Assisté** : tu donnes une contrainte (« bureau, automne, plutôt sobre »),
  l'app envoie à l'IA la garde-robe **résumée en texte** (pas les images — trop
  coûteux et inutile, les descriptions suffisent) et récupère 2-3 combinaisons
  d'`id` réels, avec une justification courte.

### 4.5 Générer la visualisation (flux copier-coller)

Une fois l'outfit composé, l'écran de visualisation te fournit :

1. **Le prompt**, assemblé par l'app à partir de :
   - la fiche de profil → « homme d'1m78, 72 kg, morphologie athlétique… » ;
   - la `description_prompt` de chaque pièce ;
   - les consignes de rendu (plein pied, fond neutre, lumière studio, photoréaliste).
   Bouton « Copier ».
2. **Le pack d'images de référence** : les photos détourées des pièces
   sélectionnées, téléchargeables en un clic, à glisser dans le générateur pour
   qu'il voie tes **vrais** vêtements et non des équivalents génériques.
3. **Un champ de réimport** : tu récupères l'image générée et tu l'attaches à
   l'outfit, qui devient consultable dans l'app.

> Le prompt est stocké dans `outfits.prompt_genere` : tu peux le retoucher,
> régénérer, comparer.

### 4.6 OutfitCopy

1. Tu uploades l'image d'une personne ou d'un personnage.
2. L'IA décompose la tenue portée : pièces, couleurs, coupes, matières perçues,
   registre stylistique d'ensemble.
3. L'app envoie cette décomposition **+ ta garde-robe résumée** à l'IA, qui
   propose 2-3 combinaisons réelles classées par proximité, chacune justifiée
   (« ce pull beige reprend le camaïeu neutre et la coupe ample »).
4. Chaque proposition est convertible en outfit enregistré, donc en prompt de
   génération d'image (4.5).

---

## 5. Séquençage

### Lot 1 — Socle (aucune IA)

Projet Next.js, Supabase, schéma, Storage. Ajout manuel de vêtement avec photo.
Détourage navigateur. Fiche vêtement, grille, filtres, tri. Fiche de profil.
Import URL (scraping + formulaire).

**Critère de sortie** : la garde-robe est saisissable et navigable de bout en bout.

### Lot 2 — Chaîne IA

Adaptateur CLI + worker + table `jobs_ia`. Prompt d'analyse de vêtement,
validation Zod. Affichage du statut d'analyse et relance manuelle. Gestion du
quota.

**Critère de sortie** : ajouter un vêtement remplit automatiquement ses attributs.

### Lot 3 — Outfits et visualisation

Composition manuelle, composition assistée par IA, assemblage du prompt,
export du pack d'images, réimport du rendu.

**Critère de sortie** : un outfit produit un prompt directement exploitable.

### Lot 4 — OutfitCopy

Upload de référence, analyse, matching, conversion en outfit.

**Critère de sortie** : une image de référence donne des tenues réelles.

---

## 6. Risques identifiés

| Risque | Gravité | Parade |
|---|---|---|
| Boutiques protégées contre le scraping | Moyenne | Repli systématique sur la saisie manuelle + upload photo |
| Quota d'abonnement atteint en lot | Moyenne | File séquentielle, pause et reprise, état visible dans l'UI |
| JSON malformé renvoyé par le LLM | Faible | Validation Zod + une relance automatique, puis échec explicite |
| Détourage de qualité inégale | Faible | Photo d'origine conservée ; détourage toujours optionnel |
| Fidélité du rendu généré | Moyenne | Images de référence fournies au générateur, prompt éditable |
| L'app dépend d'une machine allumée | Assumée | Choix explicite du 100 % local |

---

## 7. Points encore ouverts

1. **Quel générateur d'image** utiliseras-tu à la main ? Le format optimal du
   prompt en dépend (certains veulent une phrase dense, d'autres une liste
   structurée). À calibrer au lot 3, sur des essais réels.
2. **Base Supabase hébergée ou Postgres local ?** Supabase reste recommandé même
   en local : le Storage évite d'écrire une couche d'upload et de service
   d'images. À revoir si tu préfères zéro dépendance réseau.
3. **Sécurité** : en `localhost` pur, aucune authentification n'est nécessaire.
   Si un tunnel mobile est ajouté plus tard, il faudra un mot de passe unique.
