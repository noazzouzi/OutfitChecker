import { LIBELLES_CATEGORIE, OCCASIONS, SAISONS, STYLES } from '@/lib/constantes'
import type { ContexteVetement, ContrainteOutfit, PieceResumee } from './types'

/**
 * Prompt d'analyse d'un vêtement.
 *
 * Le champ décisif est `descriptionPrompt` : c'est lui qui sera réinjecté dans
 * les prompts de génération d'image au lot 3. Il est rédigé pour un générateur
 * d'image, pas pour un humain — d'où les consignes explicites et l'exemple.
 */
export function promptAnalyseVetement(
  cheminImage: string,
  contexte: ContexteVetement,
): string {
  const categorie =
    LIBELLES_CATEGORIE[contexte.categorie as keyof typeof LIBELLES_CATEGORIE] ??
    contexte.categorie

  return `Tu catalogues un vêtement pour une garde-robe numérique personnelle.

Lis l'image située à : ${cheminImage}

Ce que l'utilisateur a déjà renseigné :
- Catégorie : ${categorie}
- Nom : ${contexte.nom}${contexte.marque ? `\n- Marque : ${contexte.marque}` : ''}

Analyse UNIQUEMENT ce vêtement. Ignore le fond, le cintre, le mannequin, et les
autres pièces éventuellement visibles sur la photo.

Réponds par un objet JSON valide et RIEN d'autre : aucun texte avant ou après,
aucun bloc de code markdown.

{
  "sousCategorie": "type précis, 1 à 3 mots en français (ex : \\"chemise oxford\\", \\"chino\\", \\"derby\\", \\"parka\\")",
  "couleurPrincipale": "nom courant en français (ex : \\"bleu ciel\\", \\"écru\\", \\"bordeaux\\")",
  "couleurHex": "#rrggbb approximatif de la couleur principale",
  "couleursSecondaires": ["autres couleurs notables, [] si la pièce est unie"],
  "matiere": "matière apparente (ex : \\"coton\\", \\"laine\\", \\"cuir\\", \\"denim\\")",
  "coupe": "coupe ou silhouette (ex : \\"droite\\", \\"slim\\", \\"oversize\\", \\"cintrée\\")",
  "motif": "motif visible, \\"uni\\" si aucun (ex : \\"rayures fines\\", \\"carreaux\\")",
  "styles": ["sous-ensemble de : ${STYLES.join(', ')}"],
  "occasions": ["sous-ensemble de : ${OCCASIONS.join(', ')}"],
  "saisons": ["sous-ensemble de : ${SAISONS.join(', ')}"],
  "descriptionPrompt": "voir ci-dessous"
}

Pour "styles", "occasions" et "saisons", n'emploie que les valeurs listées,
écrites exactement comme elles apparaissent. N'en invente aucune.

"descriptionPrompt" est le champ le plus important. C'est une phrase unique,
sans sujet ni verbe, qui sera insérée telle quelle dans un prompt de génération
d'image. Elle doit permettre à un générateur de redessiner ce vêtement sans
avoir vu la photo : type de pièce, couleur précise, matière, coupe, puis les
détails visuels distinctifs (col, boutons, poches, coutures, finitions). Pas de
jugement de style, pas de nom de marque, pas de contexte d'usage.

Exemple : "chemise oxford en coton épais bleu ciel, coupe droite, col boutonné, une poche poitrine, manches longues à poignets simples"

N'invente pas de détail que tu ne vois pas. Si une information n'est pas
visible, donne la valeur la plus probable sans la sur-préciser.`
}

/**
 * Prompt de suggestion de tenues.
 *
 * La garde-robe est envoyée en texte, pas en images : les descriptions
 * produites au lot 2 suffisent, et joindre cent photos serait lent et coûteux.
 * Chaque pièce est numérotée ; le modèle répond avec ces numéros plutôt qu'avec
 * des identifiants, ce qui économise des jetons et évite les recopies fautives.
 */
export function promptSuggestionOutfits(
  garderobe: PieceResumee[],
  contrainte: ContrainteOutfit,
): string {
  const inventaire = garderobe
    .map((piece, index) => {
      const details = [
        piece.sousCategorie ?? piece.nom,
        piece.couleurPrincipale,
        piece.matiere,
        piece.motif && piece.motif !== 'uni' ? piece.motif : null,
      ]
        .filter(Boolean)
        .join(', ')

      const etiquettes = [
        piece.styles.join('/') || null,
        piece.occasions.join('/') || null,
        piece.saisons.join('/') || null,
      ]
        .filter(Boolean)
        .join(' · ')

      return `${index + 1}. [${piece.categorie}] ${details}${etiquettes ? ` — ${etiquettes}` : ''}`
    })
    .join('\n')

  const demandes = [
    contrainte.texte ? `Demande : ${contrainte.texte}` : null,
    contrainte.occasion ? `Occasion : ${contrainte.occasion}` : null,
    contrainte.saison ? `Saison : ${contrainte.saison}` : null,
  ].filter(Boolean)

  return `Tu composes des tenues à partir d'une garde-robe existante.

Garde-robe disponible :
${inventaire}

${demandes.length > 0 ? demandes.join('\n') : 'Aucune contrainte particulière : propose des tenues polyvalentes.'}

Compose 3 tenues cohérentes en n'utilisant QUE les pièces ci-dessus, désignées
par leur numéro. Chaque tenue doit comporter au minimum un haut (ou une robe),
un bas si ce n'est pas une robe, et des chaussures si la garde-robe en contient.
N'utilise jamais deux pièces de la même catégorie dans une même tenue, sauf
pour les accessoires.

Réponds par un objet JSON valide et RIEN d'autre :

{
  "propositions": [
    {
      "nom": "nom court et descriptif de la tenue",
      "pieces": [numéros des pièces],
      "justification": "une phrase : pourquoi ces pièces vont ensemble et répondent à la demande"
    }
  ]
}

Si la garde-robe ne permet pas de composer trois tenues distinctes, propose-en
moins plutôt que de te répéter ou d'inventer des pièces.`
}
