import { LIBELLES_CATEGORIE, OCCASIONS, SAISONS, STYLES } from '@/lib/constantes'
import type { ContexteVetement } from './types'

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
