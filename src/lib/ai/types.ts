import type { Occasion, Saison, Style } from '@/lib/constantes'

export type AttributsVetement = {
  sousCategorie: string | null
  couleurPrincipale: string | null
  couleurHex: string | null
  couleursSecondaires: string[]
  matiere: string | null
  coupe: string | null
  motif: string | null
  styles: Style[]
  occasions: Occasion[]
  saisons: Saison[]
  /** Phrase dense destinée à un générateur d'image. Champ le plus important. */
  descriptionPrompt: string
  /** Sortie brute du modèle, conservée pour ne rien perdre. */
  brut: unknown
}

export type ContexteVetement = {
  nom: string
  categorie: string
  marque: string | null
  /** Description reprise de la fiche produit du marchand, si disponible. */
  descriptionBoutique: string | null
}

/** Une pièce de la garde-robe, résumée pour être soumise au modèle. */
export type PieceResumee = {
  id: string
  nom: string
  categorie: string
  sousCategorie: string | null
  couleurPrincipale: string | null
  matiere: string | null
  motif: string | null
  styles: string[]
  occasions: string[]
  saisons: string[]
}

export type ContrainteOutfit = {
  texte: string | null
  occasion: string | null
  saison: string | null
}

export type OutfitSuggere = {
  nom: string
  /** Identifiants réels, déjà vérifiés comme présents dans la garde-robe. */
  vetementIds: string[]
  justification: string
}

/** Une pièce repérée sur l'image de référence. */
export type PieceReference = {
  categorie: string
  description: string
  couleur: string | null
  matiere: string | null
  /** Requête prête à être soumise au moteur de recherche de la boutique. */
  recherche: string | null
}

export type TenueDeReference = {
  /** Le registre stylistique d'ensemble, en une phrase. */
  resume: string
  pieces: PieceReference[]
}

export type PropositionCopie = OutfitSuggere & {
  /** 0 à 100 : à quel point la combinaison approche la tenue de référence. */
  proximite: number
}

export type ResultatOutfitCopy = {
  reference: TenueDeReference
  propositions: PropositionCopie[]
}

/** Les photos d'articles trouvés en boutique pour une pièce de référence. */
export type CandidatsPiece = {
  /** Index de la pièce dans `TenueDeReference.pieces`. */
  piece: number
  /** Chemins locaux des photos, dans l'ordre des articles. */
  images: string[]
}

export type NoteArticle = {
  piece: number
  /** Index de l'article dans `CandidatsPiece.images`. */
  article: number
  /** 0 à 100 : ressemblance de l'article avec la pièce vue sur l'image. */
  score: number
}

/**
 * Seul point de contact entre l'application et l'IA.
 *
 * Une seule implémentation aujourd'hui : `AdaptateurCli`, qui passe par le CLI
 * Claude Code et donc par l'abonnement. Passer à une clé API consiste à écrire
 * une seconde implémentation de cette interface — rien d'autre ne bouge.
 */
export interface FournisseurIA {
  analyserVetement(cheminImage: string, contexte: ContexteVetement): Promise<AttributsVetement>
  suggererOutfits(
    garderobe: PieceResumee[],
    contrainte: ContrainteOutfit,
  ): Promise<OutfitSuggere[]>
  /**
   * OutfitCopy : décompose la tenue vue sur une image et cherche, dans la
   * garde-robe, les combinaisons qui s'en approchent le plus.
   *
   * Un seul appel plutôt que deux — décomposer puis apparier — parce que le
   * modèle choisit les pièces en ayant l'image sous les yeux, ce qu'un résumé
   * textuel intermédiaire lui retirerait. Et parce que ça consomme moitié
   * moins de quota.
   */
  copierTenue(
    cheminImage: string,
    garderobe: PieceResumee[],
  ): Promise<ResultatOutfitCopy>
  /**
   * Note, image contre image, la ressemblance de chaque article trouvé en
   * boutique avec la pièce qu'il doit remplacer. Le moteur de recherche de la
   * boutique classe par pertinence textuelle ; seul un regard sur les photos
   * dit si l'article ressemble vraiment.
   */
  noterArticles(
    cheminReference: string,
    pieces: PieceReference[],
    candidats: CandidatsPiece[],
  ): Promise<NoteArticle[]>
}

/**
 * Levée quand le quota d'abonnement est atteint. Le worker la traite à part :
 * le job est remis en attente plus tard, il n'est pas marqué en échec.
 */
export class ErreurQuotaIA extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ErreurQuotaIA'
  }
}
