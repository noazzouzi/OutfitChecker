'use client'

import { useState } from 'react'
import { enregistrerDetourage } from '@/lib/actions'

/**
 * Détourage exécuté entièrement dans le navigateur.
 *
 * Le modèle (~quelques Mo) est téléchargé depuis le CDN d'imgly au premier
 * usage, puis mis en cache par le navigateur. C'est le seul appel réseau de
 * l'app en dehors du scraping des fiches produit. Pour fonctionner totalement
 * hors ligne, voir la section « Détourage hors ligne » du README.
 */
export function BoutonDetourage({
  id,
  urlSource,
  dejaDetoure,
}: {
  id: string
  urlSource: string
  dejaDetoure: boolean
}) {
  const [etat, setEtat] = useState<'pret' | 'encours' | 'erreur'>('pret')
  const [progression, setProgression] = useState(0)
  const [erreur, setErreur] = useState<string | null>(null)

  async function detourer() {
    setEtat('encours')
    setErreur(null)
    setProgression(0)

    try {
      // Import dynamique : la librairie est lourde, elle ne doit pas peser
      // sur le chargement initial des pages.
      const { removeBackground } = await import('@imgly/background-removal')

      const resultat = await removeBackground(urlSource, {
        output: { format: 'image/png' },
        progress: (_cle: string, courant: number, total: number) => {
          setProgression(total > 0 ? Math.round((courant / total) * 100) : 0)
        },
      })

      const donnees = new FormData()
      donnees.set('id', id)
      donnees.set('fichier', new File([resultat], 'detoure.png', { type: 'image/png' }))
      await enregistrerDetourage(donnees)

      // Rechargement complet : l'image servie change de nom de fichier.
      window.location.reload()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Le détourage a échoué.')
      setEtat('erreur')
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="bouton-secondaire w-full"
        onClick={() => void detourer()}
        disabled={etat === 'encours'}
      >
        {etat === 'encours'
          ? `Détourage… ${progression}%`
          : dejaDetoure
            ? 'Détourer à nouveau'
            : 'Détourer la photo'}
      </button>
      {etat === 'pret' && !dejaDetoure && (
        <p className="text-xs text-texte-doux">
          Le modèle est téléchargé au premier usage, puis mis en cache.
        </p>
      )}
      {erreur && <p className="text-xs text-red-600">{erreur}</p>}
    </div>
  )
}
