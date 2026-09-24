# OutfitChecker

Application web personnelle de garde-robe et de composition de tenues.
Elle tourne **entièrement en local**, sur `localhost`, sans service hébergé.

Le plan complet du MVP est dans [`docs/PLAN.md`](docs/PLAN.md).
Les quatre lots du MVP sont livrés.

---

## Démarrer

Prérequis :

- **Node.js 20.9+**
- le **CLI Claude Code** installé et connecté (`claude`). L'analyse des
  vêtements passe par lui, donc par ton abonnement — aucune clé API n'est
  nécessaire. Sans lui, tout le reste de l'application fonctionne : les
  analyses partent simplement en échec.

```bash
npm install
npm run dev
```

Aucun compilateur n'est nécessaire, y compris sous Windows : le module SQLite
(`better-sqlite3`) télécharge un binaire tout prêt à l'installation. Si
`npm install` échoue malgré tout avec « Could not find any Visual Studio
installation », c'est qu'aucun binaire n'existe pour ta version de Node :
repasse sur une version LTS (22 ou 24).

`npm run dev` lance **deux processus** : le serveur Next et le worker d'analyse.
L'application est sur <http://localhost:3000>.

La base et les images sont créées automatiquement au premier démarrage dans
`./data/` — il n'y a aucune étape d'initialisation à lancer à la main.

| Commande | Effet |
|---|---|
| `npm run dev` | Serveur Next **et** worker d'analyse |
| `npm run worker` | Worker seul (utile pour lire ses logs isolément) |
| `npm run build` / `npm start` | Build et exécution en production |
| `npm run lint` | ESLint |
| `npm run db:generate` | Régénère les migrations après modification de `src/lib/db/schema.ts` |

---

## Où vivent les données

Tout l'état de l'application tient dans **un seul dossier** :

```
data/
├── app.db          base SQLite (+ app.db-wal, app.db-shm)
└── images/         photos originales et détourées
```

Sauvegarder ce dossier, c'est sauvegarder l'application entière. Il est exclu
de git.

La base est ouverte en **mode WAL**. Ce n'est pas une optimisation : le worker
IA écrit dans cette base en même temps que le serveur Next, et sans WAL les deux
processus se bloqueraient mutuellement.

Les migrations sont appliquées automatiquement au démarrage.

---

## Les boutiques protégées

Une partie des enseignes — tout Inditex, dont **Lefties** et Zara — place un
pare-bot devant son site. Une requête HTTP ordinaire y reçoit un HTTP 200
trompeur : une page-piège JavaScript, sans Open Graph ni JSON-LD. Le scraper
voit une page valide et vide.

L'import suit donc deux chemins, dans cet ordre :

1. **Requête directe** — quelques millisecondes, suffit pour la grande majorité
   des boutiques.
2. **Repli navigateur** — uniquement si la première échoue ou revient vide. On
   pilote, en arrière-plan et sans fenêtre, le **Chrome ou Edge déjà installé**
   sur la machine : un vrai navigateur résout le défi tout seul. Compte environ
   cinq secondes.

Rien à installer si Chrome est présent aux emplacements habituels. Sinon,
indique son chemin :

```bash
OUTFITCHECKER_CHROME="/chemin/vers/chrome" npm run dev
```

Sans navigateur disponible, l'app le dit explicitement et te renvoie vers
l'ajout manuel — le parcours n'est jamais bloqué.

> Contourner une protection anti-bot sort de ce que la boutique prévoit. À
> l'échelle d'un import manuel de temps en temps, c'est sans conséquence ; ce
> mécanisme n'a pas vocation à être mis en boucle.

---

## L'analyse IA

Chaque vêtement ajouté avec une photo est mis en file d'analyse. Un worker
séparé dépile cette file et appelle le CLI Claude Code, qui lit la photo et
renvoie les attributs : sous-catégorie, couleurs, matière, coupe, motif,
styles, occasions, saisons, et une `descriptionPrompt` — une phrase visuelle
dense qui alimentera les prompts de génération d'image au lot 3.

**Le worker est un process séparé** parce qu'un appel au CLI prend plusieurs
secondes. Le faire dans une requête HTTP bloquerait l'interface à chaque ajout.
L'état de la file est visible en haut de la garde-robe.

**La description de la boutique sert de référence.** Quand un vêtement est
importé depuis une fiche produit, sa description est conservée et passée à
l'analyse. Elle fait autorité sur ce qu'une photo rend mal — composition
textile, coupe annoncée, finitions — tandis que l'image tranche sur tout ce qui
est visible. Le champ est éditable : pour un vêtement ajouté à la main, y
recopier l'étiquette produit le même effet.

Ce texte vient d'une page web tierce. Il est transmis au modèle entre balises et
présenté explicitement comme de la donnée, jamais comme une consigne — une page
marchande ne doit pas pouvoir piloter l'analyse.

**L'analyse ne remplit que les champs vides.** Ce que tu as saisi à la main
fait autorité. Le bouton « Réanalyser en écrasant » force le remplacement quand
tu le veux vraiment.

**Le quota d'abonnement est traité comme une pause, pas comme une panne.**
Quand la limite est atteinte, le job reste en attente et repart 15 minutes plus
tard, sans consommer de tentative. Les vraies erreurs, elles, sont réessayées
trois fois avec un délai croissant. Les erreurs qu'un nouvel essai ne corrigera
jamais — photo absente du disque, vêtement supprimé — échouent immédiatement,
sans appeler le CLI.

### Réglages

| Variable | Effet |
|---|---|
| `OUTFITCHECKER_CLAUDE_BIN` | Chemin du binaire `claude` s'il n'est pas dans le `PATH` |
| `OUTFITCHECKER_MODELE` | Force un modèle (par défaut : celui configuré dans ton CLI) |
| `OUTFITCHECKER_TIMEOUT_MS` | Délai maximal d'un appel (180 000 par défaut) |
| `OUTFITCHECKER_CHROME` | Chemin du navigateur pour les boutiques protégées, s'il n'est pas à un emplacement usuel |
| `OUTFITCHECKER_CHROME_ARGS` | Arguments supplémentaires passés au navigateur (rarement utile) |

### Changer de fournisseur

Toute l'IA passe par l'interface `FournisseurIA` (`src/lib/ai/types.ts`), avec
une seule implémentation : `AdaptateurCli`. Passer à une clé API revient à
écrire une seconde implémentation et à changer la ligne d'export de
`src/lib/ai/index.ts`. Rien d'autre dans l'application ne connaît le CLI.

---

## Composer et visualiser une tenue

Une tenue se compose à la main, ou se fait proposer par l'IA : elle reçoit la
garde-robe **décrite en texte** — pas les photos, les descriptions du lot 2
suffisent et coûtent bien moins cher — et renvoie des combinaisons de pièces que
tu possèdes réellement.

La fiche d'une tenue produit **deux prompts de génération d'image**, parce que
les deux générateurs visés ne réagissent pas au même registre :

| Cible | Registre | Pourquoi |
|---|---|---|
| **Nano Banana** (Gemini) | instructionnel | Il compose à partir des images jointes ; on lui parle comme à un monteur, en désignant les fichiers par leur numéro |
| **GPT Image** (ChatGPT) | descriptif | Il suit mieux une description de scène complète et s'appuie davantage sur le texte |

Le workflow est manuel, par choix : copie le prompt, télécharge le **pack
d'images**, glisse les deux dans ChatGPT ou Gemini, puis réimporte l'image
obtenue dans la fiche.

> **Le point à ne pas casser** : les fichiers du pack (`1-veste.png`,
> `2-t-shirt.png`…) sont numérotés dans le même ordre que les lignes « image N »
> du prompt instructionnel. Les deux viennent du champ `ordre` de
> `outfit_vetements`, calculé une seule fois à la création selon un ordre
> canonique (veste, haut, robe, bas, chaussures, accessoire). Si les deux
> numérotations divergent, le générateur habille le mannequin avec les mauvaises
> pièces.

Les prompts sont **recalculés à chaque affichage** depuis les pièces, donc
toujours cohérents avec la composition. Une version retouchée à la main peut
être enregistrée ; elle est alors figée, avec un retour possible au prompt généré.

Le **profil morphologique** décrit le mannequin. Sans profil, la description
reste générique et la fiche le signale.

---

## OutfitCopy

Tu donnes la photo de quelqu'un dont la tenue t'inspire — personne réelle ou
personnage. L'IA décrit ce qu'elle porte, puis cherche dans **ta** garde-robe
les combinaisons qui s'en approchent, classées par ressemblance estimée et
justifiées une par une. Chaque proposition se convertit en tenue, avec ses deux
prompts de génération ; l'image de référence reste attachée à la tenue créée.

La décomposition et la recherche de correspondances se font dans **un seul
appel**, là où le plan en prévoyait deux. Le modèle choisit les pièces en ayant
l'image sous les yeux, ce qu'un résumé textuel intermédiaire lui retirerait —
et ça consomme moitié moins de quota.

La note de ressemblance est une **estimation du modèle**, pas une mesure. Elle
sert à classer et à situer, pas à quantifier au point près.

### Ce qui s'en rapproche en boutique

Sous les propositions issues de ta garde-robe, l'écran affiche des articles
Lefties réellement en vente. Pour chaque pièce repérée sur l'image, le modèle
rédige une requête et l'app **interroge le moteur de recherche du site** — huit
requêtes au plus par image, pas un catalogue aspiré. Un clic sur un article
lance son import.

Chaque article trouvé est ensuite **noté par l'IA, photo contre photo** : de 0 à
100 %, à quel point il ressemble à la pièce vue sur l'image. Les quatre premiers
résultats de chaque recherche sont notés, en un seul appel ; leurs photos sont
téléchargées le temps de la notation puis supprimées.

Avec ces notes, l'app compose **trois tenues complètes** — la plus fidèle, puis
les deuxième et troisième choix — chacune avec :

- son **taux de ressemblance** : la moyenne des notes de ses articles, pondérée
  par le poids visuel de chaque pièce (manteau et robe ×3, haut et bas ×2,
  chaussures ×1,5, accessoires ×1). Une pièce sans article noté au moins 35 %
  compte pour zéro et s'affiche « Pas d'équivalent » : le pourcentage dit aussi
  ce que la boutique ne permet pas de copier ;
- son **prix total**, à partir des prix affichés dans les résultats.

La composition est une règle simple, sans IA (`src/lib/tenues-boutique.ts`) :
la tenue n°1 prend le meilleur article de chaque pièce, la n°2 le deuxième, la
n°3 le troisième. Compter une à deux minutes par image.

Deux réglages font toute la différence sur la pertinence, tous deux appris à la
mise au point :

- **Des requêtes courtes, dans le vocabulaire du catalogue.** « ceinture daim »
  trouve la bonne ceinture ; « ceinture daim beige boucle argentée » ramène des
  sabots. Et le modèle doit écrire « col tunisien », pas « henley ».
- **Un filtre de rayon**, déduit de la présentation renseignée dans ton profil.
  Sans lui, une recherche d'homme ramène des articles femme. Seul
  l'identifiant du rayon homme est vérifié ; pour en ajouter un autre, faire
  une recherche sur lefties.com et relever le paramètre `filter` de l'URL
  (voir `src/lib/lefties.ts`).
- **Détecter la bascule de rayon.** Quand le rayon homme n'a aucun résultat,
  le site bascule en silence sur le rayon femme et réécrit le filtre de l'URL.
  L'app le détecte, écarte ces résultats et retente avec le seul type de pièce
  (« trench long beige » → « trench »).

---

## Ce que fait le lot 1

- Ajouter un vêtement **depuis une photo** ou **depuis l'URL d'une fiche produit**
  (lecture du JSON-LD `schema.org/Product`, repli sur les balises Open Graph,
  puis formulaire pré-rempli à valider).
- **Détourer** une photo dans le navigateur.
- Parcourir la garde-robe : grille, recherche plein texte, filtres combinables
  (catégorie, saison, style, occasion, marque) et tri. L'état des filtres est
  dans l'URL, donc partageable et enregistrable en favori.
- Consulter, modifier et supprimer une fiche vêtement.
- Renseigner la **fiche de profil morphologique** utilisée plus tard dans les
  prompts de génération d'image.

Les attributs détaillés restent saisissables à la main ; le lot 2 les remplit
automatiquement.

---

## Détourage hors ligne

Le détourage s'exécute dans le navigateur. Au premier usage, le modèle est
téléchargé depuis le CDN d'imgly puis mis en cache par le navigateur. C'est le
**seul appel réseau de l'application** en dehors de la lecture des fiches
produit.

Pour un fonctionnement totalement hors ligne :

```bash
npm install @imgly/background-removal-data     # ~220 Mo
mkdir -p public/imgly
cp -r node_modules/@imgly/background-removal-data/dist/* public/imgly/
```

puis passer `publicPath: '/imgly/'` dans les options de `removeBackground`
(`src/components/BoutonDetourage.tsx`). Ajouter `/public/imgly` au `.gitignore`.

---

## Structure

```
src/
├── app/
│   ├── api/images/[fichier]/   sert les images depuis ./data/
│   ├── vetements/              ajout, fiche, modification
│   ├── outfits/                liste, compositeur, fiche, suggestions, OutfitCopy
│   ├── profil/
│   └── page.tsx                garde-robe
├── components/                 formulaires, grille, détourage, statuts, prompts
└── lib/
    ├── ai/                     interface, prompt, schéma Zod, adaptateur CLI
    ├── db/                     schéma Drizzle et connexion SQLite
    ├── actions.ts              actions serveur (création, édition, import)
    ├── boutique.ts             lecture des métadonnées de fiche produit
    ├── navigateur.ts           repli navigateur pour les boutiques protégées
    ├── images.ts               helpers partagés client/serveur
    ├── images.server.ts        écriture et lecture disque
    ├── lefties.ts              recherche d'articles chez la boutique
    ├── jobs.ts                 file d'analyse et état de la file
    ├── prompts-image.ts        les deux variantes de prompt et l'ordre des pièces
    ├── requetes.ts             lectures en base
    └── constantes.ts           vocabulaire contrôlé (catégories, styles…)
worker/
└── index.ts                    boucle d'analyse, backoff, pause quota
```

### Deux points d'architecture à connaître

**Les images ne sont pas dans `public/`.** Next y sert des fichiers connus au
moment du build ; des images ajoutées à l'exécution s'y comportent différemment
entre `next dev` et `next start`. Le route handler `/api/images/[fichier]` lit
le disque à chaque requête, avec un garde-fou contre la traversée de répertoire.

**Le worker n'est pas un module Next.** C'est pourquoi `src/lib/db/index.ts` et
`src/lib/images.server.ts` ne portent pas la marque `server-only` : ils sont
partagés avec un process Node ordinaire, où cette marque lève une erreur.

**Les accès disque utilisent des segments littéraux**
(`path.join(process.cwd(), 'data', 'images', …)`). Turbopack analyse
statiquement ces appels ; avec un chemin reconstruit depuis une constante
importée, il trace le projet entier dans la sortie de build.

---

## Sécurité

Aucune authentification : l'application est prévue pour `localhost` uniquement.
Ne pas l'exposer sur un réseau sans ajouter au minimum un mot de passe.
