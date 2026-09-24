import fs from 'node:fs'

/**
 * Repli navigateur pour les boutiques protégées.
 *
 * Certaines enseignes — tout Inditex, dont Lefties — placent un pare-bot
 * (Akamai) devant leur site. Une requête HTTP ordinaire reçoit un HTTP 200
 * trompeur contenant une page-piège JavaScript : ni Open Graph, ni JSON-LD.
 * Seul un vrai navigateur résout le défi.
 *
 * On pilote le Chrome ou l'Edge déjà installé sur la machine plutôt que de
 * télécharger un navigateur dédié : rien à installer, et ça reste local.
 * Ce chemin n'est emprunté qu'en dernier recours — la lecture directe couvre
 * la grande majorité des boutiques et reste instantanée.
 */

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

/** Marqueurs de la page-piège Akamai. */
const MOTIFS_CHALLENGE = /bm-verify|_sec\/verify|\/interstitial\//

export function ressembleAUnChallenge(html: string): boolean {
  return MOTIFS_CHALLENGE.test(html)
}

/** Emplacements usuels de Chrome et Edge, par système. */
const CHEMINS_CONNUS = [
  // macOS
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  // Windows
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  // Chrome installé pour l'utilisateur seul, sans droits administrateur.
  ...(process.env.LOCALAPPDATA
    ? [`${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`]
    : []),
  // Linux
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/microsoft-edge',
]

/**
 * Trouve un navigateur utilisable. `OUTFITCHECKER_CHROME` a la priorité :
 * c'est l'échappatoire quand Chrome est installé ailleurs.
 */
export function trouverNavigateur(): string | null {
  const impose = process.env.OUTFITCHECKER_CHROME
  if (impose) return fs.existsSync(impose) ? impose : null

  return CHEMINS_CONNUS.find((chemin) => fs.existsSync(chemin)) ?? null
}

export class NavigateurIntrouvable extends Error {
  constructor() {
    super(
      "Cette boutique bloque les requêtes automatisées et aucun navigateur n'a été trouvé " +
        'sur cette machine. Installe Chrome, ou indique son chemin dans la variable ' +
        'OUTFITCHECKER_CHROME. En attendant, ajoute le vêtement manuellement.',
    )
    this.name = 'NavigateurIntrouvable'
  }
}

export type PageRendue = {
  html: string
  /**
   * Les plus grandes images réellement affichées, de la plus grande à la plus
   * petite. Filet de sécurité : certaines fiches produit n'ont ni `og:image`
   * ni champ `image` dans leur JSON-LD, alors que la photo est bien là.
   * Seul le navigateur connaît les dimensions rendues.
   */
  imagesCandidates: string[]
}

/**
 * Ouvre un navigateur et un contexte prêts à l'emploi.
 *
 * Partagé entre la lecture d'une fiche produit et la recherche en boutique :
 * démarrer un navigateur coûte une seconde ou deux, autant n'en ouvrir qu'un
 * pour plusieurs pages.
 */
export async function ouvrirNavigateur() {
  const executable = trouverNavigateur()
  if (!executable) throw new NavigateurIntrouvable()

  const { chromium } = await import('playwright-core')

  const navigateur = await chromium.launch({
    executablePath: executable,
    // `headless` reste vrai : aucune fenêtre ne s'ouvre pendant l'import.
    headless: true,
    args: process.env.OUTFITCHECKER_CHROME_ARGS?.split(' ').filter(Boolean) ?? [],
  })

  const contexte = await navigateur.newContext({
    locale: 'fr-FR',
    userAgent: USER_AGENT,
    viewport: { width: 1280, height: 900 },
  })

  return { navigateur, contexte }
}

/**
 * Charge une page dans un vrai navigateur et renvoie son contenu une fois
 * réellement présent.
 */
export async function recupererHtmlAvecNavigateur(url: string): Promise<PageRendue> {
  const { navigateur, contexte } = await ouvrirNavigateur()

  try {
    const page = await contexte.newPage()

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })

    /*
     * Le pare-bot recharge la page lui-même une fois le défi résolu. Plutôt
     * qu'un délai fixe — toujours trop long ou trop court — on attend que des
     * métadonnées exploitables apparaissent et que le défi ait disparu.
     */
    await page
      .waitForFunction(
        () => {
          const html = document.documentElement.outerHTML
          if (/bm-verify|_sec\/verify|\/interstitial\//.test(html)) return false
          return !!document.querySelector(
            'meta[property^="og:"], script[type="application/ld+json"]',
          )
        },
        undefined,
        { timeout: 30_000, polling: 500 },
      )
      // Le délai dépassé n'est pas fatal : on renvoie ce qu'on a, et
      // l'extraction dira si c'est exploitable.
      .catch(() => {})

    /*
     * Les photos produit sont chargées en différé. Les métadonnées, elles,
     * sont là dès le rendu : sans cette seconde attente, on relève les images
     * alors que leur `naturalWidth` vaut encore 0 et aucune ne passe le filtre
     * de taille.
     */
    await page
      .waitForFunction(
        () => [...document.images].some((image) => image.naturalWidth >= 400),
        undefined,
        { timeout: 12_000, polling: 500 },
      )
      .catch(() => {})

    const imagesCandidates = await page.evaluate(() =>
      [...document.querySelectorAll('img')]
        .map((image) => ({
          src: image.currentSrc || image.src,
          aire: image.naturalWidth * image.naturalHeight,
        }))
        .filter(
          (image) =>
            image.src.startsWith('http') &&
            // Au moins 400×400 : en dessous, c'est une vignette ou un pictogramme.
            image.aire >= 160_000 &&
            !/logo|icon|sprite|placeholder|pixel/i.test(image.src),
        )
        .sort((a, b) => b.aire - a.aire)
        .slice(0, 5)
        .map((image) => image.src),
    )

    return { html: await page.content(), imagesCandidates }
  } finally {
    await navigateur.close()
  }
}
