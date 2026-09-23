import type { PieceReference } from '@/lib/ai/types'
import type { ArticleTrouve, RechercheBoutique } from '@/lib/lefties'

/**
 * Composition de tenues complètes à partir des articles trouvés en boutique.
 *
 * Aucun appel à l'IA ici : les notes de ressemblance sont déjà posées sur les
 * articles, on ne fait que les assembler. La règle est volontairement simple,
 * pour que le pourcentage affiché reste explicable :
 *
 *   · la tenue n°1 prend, pour chaque pièce, l'article le mieux noté ; la n°2
 *     le deuxième, la n°3 le troisième. Quand une pièce n'a plus d'autre
 *     candidat valable, on garde le dernier qui l'était ;
 *   · sa ressemblance est la moyenne des notes de ses articles, pondérée par
 *     le poids visuel de chaque pièce — un manteau pèse plus qu'une cravate ;
 *   · une pièce sans article assez ressemblant compte pour zéro. Le
 *     pourcentage dit donc aussi ce que la boutique ne permet pas de copier.
 */

/** En dessous, l'article ne ressemble pas assez pour représenter la pièce. */
export const SEUIL_RESSEMBLANCE = 35

const NOMBRE_TENUES = 3

/** Poids visuel d'une pièce dans la silhouette, par catégorie. */
const POIDS_CATEGORIE: Record<string, number> = {
  outerwear: 3,
  robe: 3,
  haut: 2,
  bas: 2,
  chaussures: 1.5,
  accessoire: 1,
}

function poids(categorie: string): number {
  return POIDS_CATEGORIE[categorie.trim().toLowerCase()] ?? 1
}

export type ElementTenue = {
  /** Index de la pièce de référence. */
  piece: number
  /** null : aucun article assez ressemblant pour cette pièce. */
  article: ArticleTrouve | null
}

export type TenueBoutique = {
  nom: string
  /** 0 à 100, pondérée sur toutes les pièces de la référence. */
  ressemblance: number
  /** Somme des prix connus. */
  prixTotal: number
  /** Vrai si un article retenu n'a pas de prix : le total est alors un minimum. */
  prixIncomplet: boolean
  elements: ElementTenue[]
}

const NOMS = ['La plus fidèle', 'Deuxième choix', 'Troisième choix']

export function composerTenues(
  pieces: PieceReference[],
  recherches: RechercheBoutique[],
): TenueBoutique[] {
  if (pieces.length === 0) return []

  // Pour chaque pièce, ses articles valables, du plus au moins ressemblant.
  const classement = pieces.map((_, index) =>
    recherches
      .filter((recherche) => recherche.piece === index)
      .flatMap((recherche) => recherche.articles)
      .filter((article) => (article.ressemblance ?? 0) >= SEUIL_RESSEMBLANCE)
      .sort((a, b) => (b.ressemblance ?? 0) - (a.ressemblance ?? 0)),
  )

  // Sans aucune note, il n'y a rien d'honnête à afficher.
  if (classement.every((articles) => articles.length === 0)) return []

  const poidsTotal = pieces.reduce((somme, piece) => somme + poids(piece.categorie), 0)
  const tenues: TenueBoutique[] = []
  const deja = new Set<string>()

  for (let rang = 0; rang < NOMBRE_TENUES; rang++) {
    const elements: ElementTenue[] = classement.map((articles, piece) => ({
      piece,
      article: articles[Math.min(rang, articles.length - 1)] ?? null,
    }))

    // Au-delà du nombre de candidats, les rangs suivants répètent la même tenue.
    const signature = elements.map((e) => e.article?.url ?? '-').join('|')
    if (deja.has(signature)) continue
    deja.add(signature)

    const somme = elements.reduce(
      (total, e) => total + poids(pieces[e.piece].categorie) * (e.article?.ressemblance ?? 0),
      0,
    )
    const retenus = elements.flatMap((e) => (e.article ? [e.article] : []))

    tenues.push({
      nom: NOMS[tenues.length] ?? `Choix ${tenues.length + 1}`,
      ressemblance: Math.round(somme / poidsTotal),
      prixTotal: Math.round(retenus.reduce((total, a) => total + (a.prix ?? 0), 0) * 100) / 100,
      prixIncomplet: retenus.some((a) => a.prix == null),
      elements,
    })
  }

  // Chaque rang prend des articles moins bien notés que le précédent : les
  // tenues sortent déjà de la plus à la moins ressemblante.
  return tenues
}
