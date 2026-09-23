import { ouvrirNavigateur } from '@/lib/navigateur'

/**
 * Recherche d'articles chez Lefties.
 *
 * On interroge le moteur du site plutôt que d'en aspirer le catalogue : trois
 * ou quatre requêtes par image de référence au lieu de plusieurs milliers de
 * pages, un stock toujours à jour, et c'est la pertinence de Lefties qui fait
 * le tri — elle est bonne.
 *
 * L'URL de recherche est construite directement : `?query=<termes>`. Le site
 * devine même le rayon à partir des mots employés.
 */

export type ArticleTrouve = {
  url: string
  nom: string
  prix: number | null
  image: string | null
}

export type RechercheBoutique = {
  /** Index de la pièce de référence à laquelle ces résultats répondent. */
  piece: number
  requete: string
  articles: ArticleTrouve[]
}

const BASE = 'https://www.lefties.com/fr/'

/**
 * Identifiants de rayon du site, à ajouter en filtre.
 *
 * Sans filtre, une recherche de ceinture en daim ramène des chaussettes ; avec,
 * elle ramène la ceinture et rien d'autre. Ces identifiants sont opaques : on
 * les relève dans l'URL après une recherche faite sur le site lui-même. Seul
 * celui du rayon homme est vérifié — pour en ajouter un autre, faire une
 * recherche sur lefties.com et lire le paramètre `filter` de l'URL.
 */
const RAYONS: Record<string, string> = {
  homme: '1030267562',
}

/** Déduit le rayon à filtrer depuis la présentation renseignée dans le profil. */
export function rayonDepuisProfil(genrePresentation: string | null | undefined): string | null {
  if (!genrePresentation) return null
  const normalise = genrePresentation
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  const cle = Object.keys(RAYONS).find((rayon) => normalise.includes(rayon))
  return cle ? RAYONS[cle] : null
}

/**
 * Au-delà, on solliciterait le site plus que de raison pour une seule image.
 * Six correspond à une tenue complète : manteau, haut, bas, chaussures,
 * ceinture, cravate. À cinq, la dernière pièce repérée passait à la trappe.
 */
const MAX_REQUETES = 6
const PAUSE_ENTRE_REQUETES_MS = 1_500

/**
 * Exécute plusieurs recherches dans une seule session de navigateur.
 * Une requête qui échoue ne fait pas échouer les autres : mieux vaut des
 * résultats partiels que rien.
 */
export async function rechercherChezLefties(
  requetes: { piece: number; requete: string }[],
  rayon: string | null = null,
  maxParRequete = 6,
): Promise<RechercheBoutique[]> {
  const retenues = requetes.filter((r) => r.requete.trim().length > 0).slice(0, MAX_REQUETES)
  if (retenues.length === 0) return []

  const { navigateur, contexte } = await ouvrirNavigateur()
  const resultats: RechercheBoutique[] = []

  try {
    const page = await contexte.newPage()

    for (const [rang, { piece, requete }] of retenues.entries()) {
      // Délai de politesse : on n'enchaîne pas les requêtes sans respirer.
      if (rang > 0) await new Promise((r) => setTimeout(r, PAUSE_ENTRE_REQUETES_MS))

      try {
        const adresse =
          BASE +
          '?query=' +
          encodeURIComponent(requete) +
          (rayon ? '&filter=' + encodeURIComponent(`categoryIds:${rayon}`) : '')

        await page.goto(adresse, { waitUntil: 'domcontentloaded', timeout: 45_000 })

        // La grille se remplit en différé : on attend qu'une vignette produit
        // ait une taille réelle, sans quoi on relèverait une page vide.
        await page
          .waitForFunction(
            () => [...document.images].some((image) => image.naturalWidth >= 300),
            undefined,
            { timeout: 25_000, polling: 500 },
          )
          .catch(() => {})
        await page.waitForTimeout(2_500)

        const articles = await page.evaluate(extraireArticles, maxParRequete)
        resultats.push({ piece, requete, articles })
      } catch {
        resultats.push({ piece, requete, articles: [] })
      }
    }
  } finally {
    await navigateur.close()
  }

  return resultats
}

/**
 * Exécuté dans la page. Deux précautions apprises à la mise au point :
 * les liens portant `fromrecommendation` sont des suggestions de bas de page,
 * pas des résultats ; et le nom est repris du slug de l'URL plutôt que du
 * texte de la carte, que les tailles et les mentions promotionnelles polluent.
 */
function extraireArticles(maximum: number) {
  const PRIX = /(\d+[,.]\d{2})\s*€/
  const vus = new Set<string>()

  return [...document.querySelectorAll('a[href]')]
    .filter(
      (lien): lien is HTMLAnchorElement =>
        lien instanceof HTMLAnchorElement &&
        /p\d{6,}/.test(lien.href) &&
        !lien.href.includes('fromrecommendation'),
    )
    .map((lien) => {
      // On remonte jusqu'au bloc qui porte le prix : c'est la carte produit.
      let carte: HTMLElement | null = lien.parentElement
      for (let i = 0; i < 8 && carte; i++) {
        if (PRIX.test(carte.textContent || '')) break
        carte = carte.parentElement
      }
      const prix = (carte?.textContent || '').match(PRIX)

      const slug = decodeURIComponent(lien.href.split('/').pop() || '')
        .replace(/-c\d*p\d+\.html.*$/, '')
        .replace(/-/g, ' ')
        .trim()

      // Le coloris vit dans le paramètre `colorId`. Sans lui, la fiche s'ouvre
      // dans sa couleur par défaut : on importait un trench marron après avoir
      // vu un trench beige dans les résultats. Les autres paramètres
      // (provenance, défilement) ne servent à rien et sont écartés.
      const adresse = new URL(lien.href)
      const coloris = adresse.searchParams.get('colorId')

      return {
        url: adresse.origin + adresse.pathname + (coloris ? `?colorId=${coloris}` : ''),
        nom: slug.charAt(0).toUpperCase() + slug.slice(1),
        prix: prix ? Number.parseFloat(prix[1].replace(',', '.')) : null,
        image: lien.querySelector('img')?.currentSrc?.split('?')[0] ?? null,
      }
    })
    .filter((article) => article.image && article.nom.length > 2)
    .filter((article) => !vus.has(article.url) && vus.add(article.url))
    .slice(0, maximum)
}
