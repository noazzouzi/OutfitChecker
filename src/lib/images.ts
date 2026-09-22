/**
 * Helpers d'images utilisables partout (client comme serveur).
 * Les opérations sur le disque sont dans `images.server.ts`.
 */

/** Nom de fichier accepté : uuid + extension. Sert aussi de garde-fou côté route. */
export const MOTIF_NOM_FICHIER = /^[A-Za-z0-9_-]+\.(png|jpg|jpeg|webp|avif|gif)$/

export function urlImage(nomFichier: string | null | undefined): string | null {
  if (!nomFichier) return null
  return `/api/images/${nomFichier}`
}

/** Privilégie la version détourée quand elle existe. */
export function urlAffichage(vetement: {
  imageDetoureeFichier?: string | null
  imageFichier?: string | null
}): string | null {
  return urlImage(vetement.imageDetoureeFichier ?? vetement.imageFichier)
}

export const TYPES_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
}

export function extensionDepuisMime(mime: string): string | null {
  const trouve = Object.entries(TYPES_MIME).find(([, m]) => m === mime.split(';')[0].trim())
  return trouve ? trouve[0] : null
}
