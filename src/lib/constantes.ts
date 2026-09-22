/**
 * Vocabulaire contrôlé de l'application.
 *
 * Ces listes servent à trois choses : alimenter les menus de l'interface,
 * contraindre les filtres, et — au lot 2 — cadrer ce que l'IA a le droit de
 * renvoyer. Les garder à un seul endroit évite que l'IA invente « casual chic »
 * quand l'interface propose « casual ».
 */

export const CATEGORIES = [
  'haut',
  'bas',
  'robe',
  'outerwear',
  'chaussures',
  'accessoire',
] as const
export type Categorie = (typeof CATEGORIES)[number]

export const SAISONS = ['printemps', 'été', 'automne', 'hiver'] as const
export type Saison = (typeof SAISONS)[number]

export const STYLES = [
  'casual',
  'formel',
  'business',
  'streetwear',
  'sport',
  'chic',
  'vintage',
] as const
export type Style = (typeof STYLES)[number]

export const OCCASIONS = [
  'bureau',
  'soirée',
  'week-end',
  'sport',
  'cérémonie',
  'vacances',
] as const
export type Occasion = (typeof OCCASIONS)[number]

export const STATUTS_ANALYSE = ['en_attente', 'en_cours', 'ok', 'echec'] as const
export type StatutAnalyse = (typeof STATUTS_ANALYSE)[number]

export const SOURCES_OUTFIT = ['manuel', 'suggestion_ia', 'outfitcopy'] as const
export type SourceOutfit = (typeof SOURCES_OUTFIT)[number]

export const TYPES_JOB = ['analyse_vetement', 'suggestion_outfit', 'outfitcopy'] as const
export type TypeJob = (typeof TYPES_JOB)[number]

export const STATUTS_JOB = ['en_attente', 'en_cours', 'ok', 'echec'] as const
export type StatutJob = (typeof STATUTS_JOB)[number]

/** Libellés d'affichage, pour ne pas montrer les identifiants techniques. */
export const LIBELLES_CATEGORIE: Record<Categorie, string> = {
  haut: 'Haut',
  bas: 'Bas',
  robe: 'Robe',
  outerwear: 'Veste / Manteau',
  chaussures: 'Chaussures',
  accessoire: 'Accessoire',
}
