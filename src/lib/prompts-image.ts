import { LIBELLES_CATEGORIE, type Categorie } from '@/lib/constantes'
import type { Profil, Vetement } from '@/lib/db/schema'

/**
 * Construction des prompts de génération d'image.
 *
 * Deux cibles, deux registres — ce n'est pas cosmétique :
 *
 * · Nano Banana (Gemini) compose à partir des images qu'on lui joint. On lui
 *   parle comme à un monteur, en référençant les fichiers par leur numéro.
 * · GPT Image (ChatGPT) suit mieux une description de scène complète et
 *   s'appuie davantage sur le texte, même avec des références attachées. On
 *   déroule donc intégralement les descriptions de chaque pièce.
 *
 * La numérotation des pièces vient du champ `ordre` et doit correspondre
 * exactement aux noms de fichiers du pack téléchargeable : si les deux
 * divergent, le générateur habille le mannequin avec les mauvaises pièces.
 */

export type CiblePrompt = 'nano_banana' | 'gpt_image'

export const CIBLES: { cle: CiblePrompt; nom: string; note: string }[] = [
  {
    cle: 'nano_banana',
    nom: 'Nano Banana (Gemini)',
    note: 'Joins les images du pack dans l’ordre : le prompt les appelle par leur numéro.',
  },
  {
    cle: 'gpt_image',
    nom: 'GPT Image (ChatGPT)',
    note: 'Joins aussi les images : le texte décrit tout, elles servent de référence visuelle.',
  },
]

const RENDU =
  'Cadrage vertical, sujet en pied, fond gris neutre uni, lumière de studio douce, ' +
  'photoréaliste. Pas de texte, pas de logo, pas de filigrane.'

/** Décrit le mannequin à partir de la fiche de profil. */
export function decrireMannequin(profil: Profil | null): string {
  if (!profil) return 'une personne adulte de morphologie moyenne'

  const morceaux: string[] = []
  if (profil.genrePresentation) morceaux.push(profil.genrePresentation)
  if (profil.tailleCm) morceaux.push(`${profil.tailleCm} cm`)
  if (profil.poidsKg) morceaux.push(`${profil.poidsKg} kg`)
  if (profil.morphotype) morceaux.push(`morphologie ${profil.morphotype}`)
  if (profil.teint) morceaux.push(`teint ${profil.teint}`)
  if (profil.cheveux) morceaux.push(`cheveux ${profil.cheveux}`)

  if (morceaux.length === 0) return 'une personne adulte de morphologie moyenne'
  return morceaux.join(', ')
}

/**
 * Description d'une pièce. `descriptionPrompt` est rédigée par l'IA pour un
 * générateur d'image ; sans elle on retombe sur les attributs bruts, ce qui
 * marche mais donne un rendu plus générique.
 */
export function decrirePiece(vetement: Vetement): string {
  if (vetement.descriptionPrompt) return vetement.descriptionPrompt

  const morceaux = [
    vetement.sousCategorie ?? LIBELLES_CATEGORIE[vetement.categorie as Categorie].toLowerCase(),
    vetement.matiere ? `en ${vetement.matiere}` : null,
    vetement.couleurPrincipale,
    vetement.coupe ? `coupe ${vetement.coupe}` : null,
    vetement.motif && vetement.motif !== 'uni' ? vetement.motif : null,
  ].filter(Boolean)

  return morceaux.join(' ')
}

function notesDeStyle(profil: Profil | null): string {
  return profil?.notesStyle ? `\n\nPréférences à respecter : ${profil.notesStyle}` : ''
}

/** Variante instructionnelle, qui référence les images jointes par leur numéro. */
function promptNanoBanana(pieces: Vetement[], profil: Profil | null): string {
  const lignes = pieces
    .map(
      (piece, index) =>
        `- image ${index + 1} (${LIBELLES_CATEGORIE[piece.categorie as Categorie].toLowerCase()}) : ${decrirePiece(piece)}`,
    )
    .join('\n')

  return `À partir des images jointes, génère une photographie de mode.

Mannequin : ${decrireMannequin(profil)}.

Habille-le avec ces pièces, en conservant fidèlement la couleur, la matière, la coupe et les détails de chacune :
${lignes}

Ne modifie aucun vêtement, ne réinterprète pas les couleurs, n'ajoute aucune pièce qui ne figure pas dans la liste.

${RENDU}${notesDeStyle(profil)}`
}

/** Variante descriptive, qui décrit la scène entière. */
function promptGptImage(pieces: Vetement[], profil: Profil | null): string {
  const tenue = pieces.map(decrirePiece).join(' ; ')

  return `Photographie de mode photoréaliste, sujet en pied.

Sujet : ${decrireMannequin(profil)}.

Tenue portée : ${tenue}.

Respecte précisément les couleurs, matières et coupes décrites. N'ajoute aucun vêtement supplémentaire.

${RENDU}${notesDeStyle(profil)}`
}

/**
 * Produit les deux prompts. Toujours recalculé depuis les pièces : les deux
 * restent ainsi cohérents avec l'outfit, même après ajout ou retrait d'une pièce.
 */
export function construirePrompts(
  pieces: Vetement[],
  profil: Profil | null,
): Record<CiblePrompt, string> {
  return {
    nano_banana: promptNanoBanana(pieces, profil),
    gpt_image: promptGptImage(pieces, profil),
  }
}

/**
 * Nom de fichier d'une pièce dans le pack. Le numéro est ce qui relie le
 * fichier à la ligne « image N » du prompt instructionnel.
 */
export function nomFichierPack(vetement: Vetement, index: number): string {
  const base = (vetement.sousCategorie ?? vetement.nom)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)

  const source = vetement.imageDetoureeFichier ?? vetement.imageFichier ?? ''
  const extension = source.split('.').pop() || 'png'

  return `${index + 1}-${base || 'piece'}.${extension}`
}

/** Ordre de lecture d'une tenue, du plus extérieur au plus accessoire. */
const RANG_CATEGORIE: Record<Categorie, number> = {
  outerwear: 0,
  haut: 1,
  robe: 2,
  bas: 3,
  chaussures: 4,
  accessoire: 5,
}

export function ordonnerPieces(pieces: Vetement[]): Vetement[] {
  return [...pieces].sort(
    (a, b) =>
      RANG_CATEGORIE[a.categorie as Categorie] - RANG_CATEGORIE[b.categorie as Categorie] ||
      a.nom.localeCompare(b.nom, 'fr'),
  )
}
