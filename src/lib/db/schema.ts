import { sqliteTable, text, integer, real, primaryKey } from 'drizzle-orm/sqlite-core'
import type {
  Categorie,
  Occasion,
  Saison,
  SourceOutfit,
  StatutAnalyse,
  StatutJob,
  Style,
  TypeJob,
} from '@/lib/constantes'

/**
 * SQLite n'a pas de type tableau : les champs multivalués sont stockés en JSON
 * (`{ mode: 'json' }`). Le filtrage se fait côté client, sur la garde-robe
 * chargée en mémoire — à l'échelle de quelques centaines de pièces c'est
 * instantané, et ça évite toute requête SQL sur du JSON.
 */

/** Profil morphologique. Une seule ligne, toujours `id = 1`. */
export const profil = sqliteTable('profil', {
  id: integer('id').primaryKey(),
  tailleCm: integer('taille_cm'),
  poidsKg: integer('poids_kg'),
  morphotype: text('morphotype'),
  genrePresentation: text('genre_presentation'),
  teint: text('teint'),
  cheveux: text('cheveux'),
  pointure: integer('pointure'),
  notesStyle: text('notes_style'),
})

export const vetements = sqliteTable('vetements', {
  id: text('id').primaryKey(),
  createdAt: integer('created_at').notNull(),

  // Saisi par l'utilisateur ou récupéré sur la fiche produit
  nom: text('nom').notNull(),
  categorie: text('categorie').$type<Categorie>().notNull(),
  marque: text('marque'),
  taille: text('taille'),
  prix: real('prix'),
  urlSource: text('url_source'),
  boutique: text('boutique'),

  // Renseignés par l'IA au lot 2 — laissés vides jusque-là
  sousCategorie: text('sous_categorie'),
  couleurPrincipale: text('couleur_principale'),
  couleurHex: text('couleur_hex'),
  couleursSecondaires: text('couleurs_secondaires', { mode: 'json' }).$type<string[]>(),
  matiere: text('matiere'),
  coupe: text('coupe'),
  motif: text('motif'),
  styles: text('styles', { mode: 'json' }).$type<Style[]>(),
  occasions: text('occasions', { mode: 'json' }).$type<Occasion[]>(),
  saisons: text('saisons', { mode: 'json' }).$type<Saison[]>(),

  /** Phrase dense rédigée pour un générateur d'image, réutilisée au lot 3. */
  descriptionPrompt: text('description_prompt'),
  /** Sortie IA complète, conservée telle quelle pour ne rien perdre. */
  attributsBruts: text('attributs_bruts', { mode: 'json' }),

  // Noms de fichiers dans ./data/images
  imageFichier: text('image_fichier'),
  imageDetoureeFichier: text('image_detouree_fichier'),

  statutAnalyse: text('statut_analyse')
    .$type<StatutAnalyse>()
    .notNull()
    .default('en_attente'),
})

export const outfits = sqliteTable('outfits', {
  id: text('id').primaryKey(),
  createdAt: integer('created_at').notNull(),
  nom: text('nom').notNull(),
  occasion: text('occasion').$type<Occasion>(),
  saison: text('saison').$type<Saison>(),
  note: text('note'),
  source: text('source').$type<SourceOutfit>().notNull().default('manuel'),
  /** Une entrée par générateur cible : { nano_banana: "...", gpt_image: "..." } */
  prompts: text('prompts', { mode: 'json' }).$type<Record<string, string>>(),
  imageRenduFichier: text('image_rendu_fichier'),
  referenceImageFichier: text('reference_image_fichier'),
})

export const outfitVetements = sqliteTable(
  'outfit_vetements',
  {
    outfitId: text('outfit_id')
      .notNull()
      .references(() => outfits.id, { onDelete: 'cascade' }),
    vetementId: text('vetement_id')
      .notNull()
      .references(() => vetements.id, { onDelete: 'cascade' }),
    role: text('role'),
    /**
     * Détermine la numérotation du pack d'images ET les références
     * « image 1, image 2… » du prompt instructionnel. Les deux doivent
     * correspondre, sinon le générateur associe les mauvaises pièces.
     */
    ordre: integer('ordre').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.outfitId, t.vetementId] })],
)

/** File d'attente des appels IA, dépilée par le worker (lot 2). */
export const jobsIa = sqliteTable('jobs_ia', {
  id: text('id').primaryKey(),
  createdAt: integer('created_at').notNull(),
  type: text('type').$type<TypeJob>().notNull(),
  payload: text('payload', { mode: 'json' }),
  statut: text('statut').$type<StatutJob>().notNull().default('en_attente'),
  tentatives: integer('tentatives').notNull().default(0),
  /**
   * Horodatage avant lequel le job ne doit pas être repris. Sert au backoff
   * après un échec, et à la mise en pause quand le quota d'abonnement est
   * atteint — dans ce cas le job reste `en_attente`, il n'échoue pas.
   */
  disponibleA: integer('disponible_a').notNull().default(0),
  erreur: text('erreur'),
  resultat: text('resultat', { mode: 'json' }),
})

export type Vetement = typeof vetements.$inferSelect
export type NouveauVetement = typeof vetements.$inferInsert
export type Profil = typeof profil.$inferSelect
export type Outfit = typeof outfits.$inferSelect
