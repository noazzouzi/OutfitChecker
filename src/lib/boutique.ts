import 'server-only'

import * as cheerio from 'cheerio'

export type FicheProduit = {
  nom: string | null
  marque: string | null
  prix: number | null
  devise: string | null
  imageUrl: string | null
  boutique: string | null
  description: string | null
  /** D'où viennent les données : utile pour afficher un avertissement honnête. */
  source: 'json-ld' | 'open-graph' | 'partiel'
}

/**
 * Récupère les métadonnées d'une fiche produit.
 *
 * Deux sources, dans cet ordre de fiabilité :
 *   1. JSON-LD `schema.org/Product` — structuré, c'est ce que les e-commerces
 *      publient pour Google. Contient marque et prix.
 *   2. Balises Open Graph — présentes presque partout, mais pauvres
 *      (rarement la marque, parfois le prix).
 *
 * Le résultat n'est jamais considéré comme fiable : il pré-remplit un
 * formulaire que l'utilisateur valide.
 */
export async function lireFicheProduit(url: string): Promise<FicheProduit> {
  const cible = new URL(url)
  if (cible.protocol !== 'http:' && cible.protocol !== 'https:') {
    throw new Error('Seules les URL http(s) sont acceptées.')
  }

  const reponse = await fetch(cible, {
    headers: {
      // Sans User-Agent de navigateur, beaucoup de boutiques renvoient 403.
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
      Accept: 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
  })

  if (!reponse.ok) {
    throw new Error(
      `La boutique a refusé la requête (HTTP ${reponse.status}). Ajoute le vêtement manuellement.`,
    )
  }

  const $ = cheerio.load(await reponse.text())

  const produit = extraireJsonLd($)
  const og = extraireOpenGraph($, cible)

  // Le JSON-LD est plus riche, mais on complète ses trous avec l'Open Graph.
  const fiche: FicheProduit = {
    nom: produit?.nom ?? og.nom ?? $('title').text().trim() ?? null,
    marque: produit?.marque ?? og.marque ?? null,
    prix: produit?.prix ?? og.prix ?? null,
    devise: produit?.devise ?? og.devise ?? null,
    imageUrl: absolutiser(produit?.imageUrl ?? og.imageUrl, cible),
    boutique: og.boutique ?? cible.hostname.replace(/^www\./, ''),
    description: produit?.description ?? og.description ?? null,
    source: produit ? 'json-ld' : og.nom || og.imageUrl ? 'open-graph' : 'partiel',
  }

  return fiche
}

type Partielle = Omit<FicheProduit, 'source' | 'boutique'> & { boutique?: string | null }

function extraireJsonLd($: cheerio.CheerioAPI): Partielle | null {
  const scripts = $('script[type="application/ld+json"]').toArray()

  for (const script of scripts) {
    const brut = $(script).contents().text().trim()
    if (!brut) continue

    let donnees: unknown
    try {
      donnees = JSON.parse(brut)
    } catch {
      // Du JSON-LD malformé est fréquent : on passe au bloc suivant.
      continue
    }

    const produit = trouverProduit(donnees)
    if (produit) return lireProduit(produit)
  }
  return null
}

/**
 * Le nœud Product peut être à la racine, dans un tableau, ou imbriqué dans un
 * `@graph`. On parcourt récursivement plutôt que de supposer une forme.
 */
function trouverProduit(noeud: unknown, profondeur = 0): Record<string, unknown> | null {
  if (profondeur > 6 || noeud === null || typeof noeud !== 'object') return null

  if (Array.isArray(noeud)) {
    for (const element of noeud) {
      const trouve = trouverProduit(element, profondeur + 1)
      if (trouve) return trouve
    }
    return null
  }

  const objet = noeud as Record<string, unknown>
  const type = objet['@type']
  const types = Array.isArray(type) ? type : [type]
  if (types.some((t) => typeof t === 'string' && t.toLowerCase().includes('product'))) {
    return objet
  }

  for (const valeur of Object.values(objet)) {
    const trouve = trouverProduit(valeur, profondeur + 1)
    if (trouve) return trouve
  }
  return null
}

function lireProduit(produit: Record<string, unknown>): Partielle {
  const offre = premierElement(produit.offers) as Record<string, unknown> | null

  return {
    nom: texte(produit.name),
    marque: texte(
      typeof produit.brand === 'object' && produit.brand !== null
        ? (produit.brand as Record<string, unknown>).name
        : produit.brand,
    ),
    prix: nombre(offre?.price ?? offre?.lowPrice),
    devise: texte(offre?.priceCurrency),
    imageUrl: texte(
      typeof premierElement(produit.image) === 'object'
        ? (premierElement(produit.image) as Record<string, unknown>)?.url
        : premierElement(produit.image),
    ),
    description: texte(produit.description),
  }
}

function extraireOpenGraph($: cheerio.CheerioAPI, cible: URL): Partielle {
  const meta = (propriete: string) =>
    $(`meta[property="${propriete}"]`).attr('content') ??
    $(`meta[name="${propriete}"]`).attr('content') ??
    null

  return {
    nom: meta('og:title'),
    marque: meta('product:brand') ?? meta('og:brand'),
    prix: nombre(meta('product:price:amount') ?? meta('og:price:amount')),
    devise: meta('product:price:currency') ?? meta('og:price:currency'),
    imageUrl: meta('og:image') ?? meta('twitter:image'),
    description: meta('og:description') ?? meta('description'),
    boutique: meta('og:site_name') ?? cible.hostname.replace(/^www\./, ''),
  }
}

function premierElement(valeur: unknown): unknown {
  return Array.isArray(valeur) ? (valeur[0] ?? null) : (valeur ?? null)
}

function texte(valeur: unknown): string | null {
  if (typeof valeur === 'string') {
    const propre = valeur.trim()
    return propre.length > 0 ? propre : null
  }
  if (typeof valeur === 'number') return String(valeur)
  return null
}

function nombre(valeur: unknown): number | null {
  if (typeof valeur === 'number') return Number.isFinite(valeur) ? valeur : null
  if (typeof valeur !== 'string') return null
  // Gère « 49,90 € » comme « 49.90 »
  const nettoye = valeur.replace(/[^\d.,-]/g, '').replace(',', '.')
  const resultat = Number.parseFloat(nettoye)
  return Number.isFinite(resultat) ? resultat : null
}

function absolutiser(url: string | null | undefined, base: URL): string | null {
  if (!url) return null
  try {
    return new URL(url, base).toString()
  } catch {
    return null
  }
}
