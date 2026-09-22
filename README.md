# OutfitChecker

Application web personnelle de garde-robe et de composition de tenues.
Elle tourne **entièrement en local**, sur `localhost`, sans service hébergé.

Le plan complet du MVP est dans [`docs/PLAN.md`](docs/PLAN.md).
Ce dépôt en est au **lot 1 — Socle**.

---

## Démarrer

Prérequis : **Node.js 20.9+**.

```bash
npm install
npm run dev
```

L'application est sur <http://localhost:3000>.

La base et les images sont créées automatiquement au premier démarrage dans
`./data/` — il n'y a aucune étape d'initialisation à lancer à la main.

| Commande | Effet |
|---|---|
| `npm run dev` | Serveur de développement |
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

La base est ouverte en **mode WAL**. Ce n'est pas une optimisation : au lot 2,
le worker IA écrira dans cette base en même temps que le serveur Next, et sans
WAL les deux processus se bloqueraient mutuellement.

Les migrations sont appliquées automatiquement au démarrage.

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

Les attributs détaillés (matière, coupe, motif, styles, occasions…) se
saisissent à la main pour l'instant. **Au lot 2, l'IA les remplira
automatiquement** — le champ `statutAnalyse` de chaque vêtement est déjà à
`en_attente` dans ce but.

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
│   ├── profil/
│   └── page.tsx                garde-robe
├── components/                 formulaires, grille, détourage
└── lib/
    ├── db/                     schéma Drizzle et connexion SQLite
    ├── actions.ts              actions serveur (création, édition, import)
    ├── boutique.ts             lecture des métadonnées de fiche produit
    ├── images.ts               helpers partagés client/serveur
    ├── images.server.ts        écriture et lecture disque
    ├── requetes.ts             lectures en base
    └── constantes.ts           vocabulaire contrôlé (catégories, styles…)
```

### Deux points d'architecture à connaître

**Les images ne sont pas dans `public/`.** Next y sert des fichiers connus au
moment du build ; des images ajoutées à l'exécution s'y comportent différemment
entre `next dev` et `next start`. Le route handler `/api/images/[fichier]` lit
le disque à chaque requête, avec un garde-fou contre la traversée de répertoire.

**Les accès disque utilisent des segments littéraux**
(`path.join(process.cwd(), 'data', 'images', …)`). Turbopack analyse
statiquement ces appels ; avec un chemin reconstruit depuis une constante
importée, il trace le projet entier dans la sortie de build.

---

## Sécurité

Aucune authentification : l'application est prévue pour `localhost` uniquement.
Ne pas l'exposer sur un réseau sans ajouter au minimum un mot de passe.
