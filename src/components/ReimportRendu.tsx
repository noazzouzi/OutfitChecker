'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { enregistrerRendu } from '@/lib/actions'

/** Récupère l'image produite par le générateur externe et l'attache à la tenue. */
export function ReimportRendu({ outfitId, dejaRendu }: { outfitId: string; dejaRendu: boolean }) {
  const router = useRouter()
  const champ = useRef<HTMLInputElement>(null)
  const [enCours, setEnCours] = useState(false)

  async function envoyer(fichier: File) {
    setEnCours(true)
    const donnees = new FormData()
    donnees.set('id', outfitId)
    donnees.set('fichier', fichier)
    await enregistrerRendu(donnees)
    setEnCours(false)
    if (champ.current) champ.current.value = ''
    router.refresh()
  }

  return (
    <label className="block space-y-1">
      <span className="etiquette">
        {dejaRendu ? 'Remplacer le rendu' : 'Importer le rendu généré'}
      </span>
      <input
        ref={champ}
        className="champ"
        type="file"
        accept="image/*"
        disabled={enCours}
        onChange={(e) => {
          const fichier = e.target.files?.[0]
          if (fichier) void envoyer(fichier)
        }}
      />
      {enCours && <span className="text-xs text-texte-doux">Envoi…</span>}
    </label>
  )
}
