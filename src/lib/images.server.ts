// Pas de `server-only` ici : ce module est aussi importé par le worker IA,
// qui tourne hors du runtime Next.
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { extensionDepuisMime, MOTIF_NOM_FICHIER } from '@/lib/images'

/** 15 Mo : large pour une photo de vêtement, assez bas pour éviter les accidents. */
const TAILLE_MAX = 15 * 1024 * 1024

/**
 * Les segments `'data'` et `'images'` sont écrits en littéral plutôt que repris
 * d'une constante importée : Turbopack analyse statiquement les accès disque et,
 * sans ça, trace le projet entier dans la sortie de build.
 */
export function cheminImage(nomFichier: string): string {
  if (!MOTIF_NOM_FICHIER.test(nomFichier)) {
    throw new Error(`Nom de fichier image invalide : ${nomFichier}`)
  }
  return path.join(process.cwd(), 'data', 'images', nomFichier)
}

/** Écrit des octets dans ./data/images et renvoie le nom de fichier généré. */
export async function enregistrerImage(
  donnees: ArrayBuffer | Uint8Array,
  mime: string,
): Promise<string> {
  const extension = extensionDepuisMime(mime)
  if (!extension) throw new Error(`Type d'image non pris en charge : ${mime}`)

  const octets = donnees instanceof Uint8Array ? donnees : new Uint8Array(donnees)
  if (octets.byteLength > TAILLE_MAX) {
    throw new Error("L'image dépasse 15 Mo.")
  }

  const nomFichier = `${randomUUID()}.${extension}`
  await fs.mkdir(path.join(process.cwd(), 'data', 'images'), { recursive: true })
  await fs.writeFile(path.join(process.cwd(), 'data', 'images', nomFichier), octets)
  return nomFichier
}

export async function enregistrerFichierEnvoye(fichier: File): Promise<string> {
  if (!fichier.type.startsWith('image/')) {
    throw new Error("Le fichier envoyé n'est pas une image.")
  }
  return enregistrerImage(await fichier.arrayBuffer(), fichier.type)
}

/**
 * Télécharge l'image d'une fiche produit.
 * Refuse tout ce qui n'est pas http(s) et tout ce qui n'est pas une image :
 * l'URL vient d'une page tierce, on ne lui fait pas confiance.
 */
export async function telechargerImage(url: string): Promise<string> {
  const cible = new URL(url)
  if (cible.protocol !== 'http:' && cible.protocol !== 'https:') {
    throw new Error('Seules les URL http(s) sont acceptées.')
  }

  const reponse = await fetch(cible, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OutfitChecker/1.0)' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!reponse.ok) {
    throw new Error(`Image inaccessible (HTTP ${reponse.status}).`)
  }

  const mime = reponse.headers.get('content-type') ?? ''
  if (!mime.startsWith('image/')) {
    throw new Error("L'URL ne pointe pas vers une image.")
  }

  return enregistrerImage(await reponse.arrayBuffer(), mime)
}

export async function supprimerImage(nomFichier: string | null | undefined): Promise<void> {
  if (!nomFichier) return
  try {
    await fs.unlink(cheminImage(nomFichier))
  } catch {
    // Fichier déjà absent : rien à faire.
  }
}
