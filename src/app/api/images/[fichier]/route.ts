import fs from 'node:fs/promises'
import { cheminImage } from '@/lib/images.server'
import { MOTIF_NOM_FICHIER, TYPES_MIME } from '@/lib/images'

/**
 * Sert les images depuis ./data/, hors de `public/`.
 *
 * Pourquoi ne pas les mettre dans `public/` ? Next y sert des fichiers connus
 * au moment du build ; des images ajoutées à l'exécution s'y comportent
 * différemment entre `next dev` et `next start`. Ici on lit le disque à chaque
 * requête : comportement identique partout.
 */
export async function GET(
  _requete: Request,
  { params }: { params: Promise<{ fichier: string }> },
) {
  const { fichier } = await params

  // Garde-fou contre la traversée de répertoire (`../../etc/passwd`).
  if (!MOTIF_NOM_FICHIER.test(fichier)) {
    return new Response('Nom de fichier invalide', { status: 400 })
  }

  try {
    const octets = await fs.readFile(cheminImage(fichier))
    const extension = fichier.split('.').pop()!.toLowerCase()

    return new Response(new Uint8Array(octets), {
      headers: {
        'Content-Type': TYPES_MIME[extension] ?? 'application/octet-stream',
        // Les noms de fichiers sont des uuid : le contenu ne change jamais.
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch {
    return new Response('Image introuvable', { status: 404 })
  }
}
