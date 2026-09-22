import 'server-only'

import * as cheerio from 'cheerio'
import {
  NavigateurIntrouvable,
  recupererHtmlAvecNavigateur,
  ressembleAUnChallenge,
} from '@/lib/navigateur'

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
  /** Comment la page a été obtenue. */
  lecture: 'directe' | 'navigateur'
}

/**
 * Récupère les métadonnées d'une fiche produit.
 *
 * Deux chemins, dans cet ordre :
 *
 *   1. Requête HTTP directe. Instantanée, suffit pour la grande majorité des
 *      boutiques. On y lit le JSON-LD `schema.org/Product` — structuré, c'est
 *      ce que les e-commerces publient pour Google — puis, à défaut, les
 *      balises Open Graph.
 *   2. Repli navigateur, si la requête directe échoue ou revient vide. Les
 *      enseignes protégées par un pare-bot (tout Inditex, dont Lefties)
 *      répondent HTTP 200 avec une page-piège JavaScript sans aucune
 *      métadonnée : seul un vrai navigateur en vient à bout.
 *
 * Le résultat n'est jamais considéré comme fiable : il pré-remplit un
 * formulaire que l'utilisateur valide.
 */
export async function lireFicheProduit(url: string): Promise<FicheProduit> {
  const cible = new URL(url)
  if (cible.protocol !== 'http:' && cible.protocol !== 'https:') {
    throw new Error('Seules les URL http(s) sont acceptées.')
  }

  let fiche: FicheProduit | null = null
  let echecDirect: Error | null = null

  try {
    const html = await recupererHtmlDirect(cible)
    // Une page-piège se reconnaît à ses marqueurs : inutile d'en extraire
    // quoi que ce soit, elle ne contient pas la fiche produit.
    if (!ressembleAUnChallenge(html)) {
      fiche = extraireFiche(html, cible, 'directe')
    }
  } catch (erreur) {
    echecDirect = erreur instanceof Error ? erreur : new Error(String(erreur))
  }

  if (fiche && !estIncomplete(fiche)) return fiche

  // La lecture directe n'a rien donné : on passe par le navigateur.
  try {
    const html = await recupererHtmlAvecNavigateur(cible.toString())
    const parNavigateur = extraireFiche(html, cible, 'navigateur')

    // On garde la lecture la plus fournie des deux.
    if (!estIncomplete(parNavigateur)) return parNavigateur
    if (fiche && !estVide(fiche)) return fiche
    if (!estVide(parNavigateur)) return parNavigateur

    // Les deux chemins ont échoué : un formulaire vide sans explication
    // laisserait l'utilisateur dans le noir.
    throw new Error(
      `${echecDirect ? `${echecDirect.message} ` : ''}La lecture par navigateur n'a` +
        " rien donné non plus. Ajoute le vêtement manuellement avec une photo.",
    )
  } catch (erreur) {
    // Pas de navigateur disponible : mieux vaut rendre le peu qu'on a que rien.
    if (erreur instanceof NavigateurIntrouvable) {
      if (fiche && !estVide(fiche)) return fiche
      throw erreur
    }
    if (fiche && !estVide(fiche)) return fiche
    throw erreur
  }
}

/** Sans nom ou sans image, le formulaire n'est que partiellement pré-rempli. */
function estIncomplete(fiche: FicheProduit): boolean {
  return !fiche.nom || !fiche.imageUrl
}

/** Rien d'exploitable du tout : autant le dire plutôt qu'ouvrir un formulaire vide. */
function estVide(fiche: FicheProduit): boolean {
  return !fiche.nom && !fiche.imageUrl && !fiche.description
}

async function recupererHtmlDirect(cible: URL): Promise<string> {
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
    throw new Error(`La boutique a refusé la requête (HTTP ${reponse.status}).`)
  }
  return reponse.text()
}

function extraireFiche(
  html: string,
  cible: URL,
  lecture: 'directe' | 'navigateur',
): FicheProduit {
  const $ = cheerio.load(html)

  const produit = extraireJsonLd($)
  const og = extraireOpenGraph($, cible)

  // Le JSON-LD est plus riche, mais on complète ses trous avec l'Open Graph.
  return {
    nom: produit?.nom ?? og.nom ?? texte($('title').text()),
    marque: produit?.marque ?? og.marque ?? null,
    prix: produit?.prix ?? og.prix ?? null,
    devise: produit?.devise ?? og.devise ?? null,
    imageUrl: absolutiser(produit?.imageUrl ?? og.imageUrl, cible),
    boutique: og.boutique ?? cible.hostname.replace(/^www\./, ''),
    description: produit?.description ?? og.description ?? null,
    source: produit ? 'json-ld' : og.nom || og.imageUrl ? 'open-graph' : 'partiel',
    lecture,
  }
}

type Partielle = Omit<FicheProduit, 'source' | 'boutique' | 'lecture'> & {
  boutique?: string | null
}

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
