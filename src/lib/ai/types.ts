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
