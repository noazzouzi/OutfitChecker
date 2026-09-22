import { z } from 'zod'
import { OCCASIONS, SAISONS, STYLES } from '@/lib/constantes'

/**
 * Validation volontairement tolérante.
 *
 * Un modèle répond parfois « casual chic » là où le vocabulaire ne connaît que
 * « casual », ou renvoie une chaîne au lieu d'un tableau. Rejeter toute
 * l'analyse pour ça serait absurde : on retient ce qui est connu, on ignore le
 * reste, et la sortie brute est stockée de toute façon.
 *
 * Une seule exception : `descriptionPrompt`. C'est le champ qui alimentera les
 * prompts de génération d'image — sans lui, l'analyse ne sert à rien, donc on
 * échoue et on retente.
 */

/** Accepte un tableau, une chaîne seule, ou rien. */
function liste() {
  return z.preprocess(
    (valeur) => (typeof valeur === 'string' ? [valeur] : Array.isArray(valeur) ? valeur : []),
    z.array(z.unknown()),
  )
}

function sousEnsemble<T extends string>(vocabulaire: readonly T[]) {
  return liste().transform((valeurs) =>
    Array.from(
      new Set(
        valeurs
          .filter((v): v is string => typeof v === 'string')
          .map((v) => v.trim().toLowerCase())
          .filter((v): v is T => (vocabulaire as readonly string[]).includes(v)),
      ),
    ),
  )
}

const texteLibre = z
  .unknown()
  .transform((valeur) =>
    typeof valeur === 'string' && valeur.trim().length > 0 ? valeur.trim() : null,
  )

const couleurHex = z
  .unknown()
  .transform((valeur) =>
    typeof valeur === 'string' && /^#[0-9a-f]{6}$/i.test(valeur.trim())
      ? valeur.trim().toLowerCase()
      : null,
  )

export const schemaAnalyseVetement = z.object({
  sousCategorie: texteLibre,
  couleurPrincipale: texteLibre,
  couleurHex,
  couleursSecondaires: liste().transform((valeurs) =>
    valeurs
      .filter((v): v is string => typeof v === 'string')
      .map((v) => v.trim())
      .filter((v) => v.length > 0),
  ),
  matiere: texteLibre,
  coupe: texteLibre,
  motif: texteLibre,
  styles: sousEnsemble(STYLES),
  occasions: sousEnsemble(OCCASIONS),
  saisons: sousEnsemble(SAISONS),
  descriptionPrompt: z
    .string({ error: 'descriptionPrompt manquante ou non textuelle.' })
    .trim()
    .min(15, 'descriptionPrompt trop courte pour être exploitable.'),
})

/**
 * Propositions d'outfits.
 *
 * Le modèle ne manipule pas les uuid mais des numéros de ligne : c'est plus
 * économe en jetons et beaucoup moins sujet aux erreurs de recopie. La
 * conversion numéro → identifiant, et le rejet des numéros hors bornes, se
 * font côté appelant.
 */
export const schemaSuggestions = z.object({
  propositions: z
    .array(
      z.object({
        nom: z.string().trim().min(1).catch('Tenue sans nom'),
        pieces: z.preprocess(
          (valeur) => (Array.isArray(valeur) ? valeur : []),
          z.array(z.coerce.number().int()),
        ),
        justification: z.string().trim().catch(''),
      }),
    )
    .default([]),
})

/**
 * Isole l'objet JSON dans la réponse du modèle. Même en demandant « du JSON et
 * rien d'autre », un bloc ```json ou une phrase d'introduction arrivent.
 */
export function extraireJson(texte: string): unknown {
  const bloc = texte.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidat = bloc ? bloc[1] : texte

  const debut = candidat.indexOf('{')
  const fin = candidat.lastIndexOf('}')
  if (debut === -1 || fin <= debut) {
    throw new Error(`Aucun objet JSON dans la réponse : ${texte.slice(0, 200)}`)
  }

  return JSON.parse(candidat.slice(debut, fin + 1))
}
