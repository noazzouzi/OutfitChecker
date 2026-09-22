'use client'

import { useState, useTransition } from 'react'
import { supprimerVetement } from '@/lib/actions'

export function BoutonSupprimer({ id, nom }: { id: string; nom: string }) {
  const [confirme, setConfirme] = useState(false)
  const [enCours, demarrer] = useTransition()

  if (!confirme) {
    return (
      <button type="button" className="bouton-secondaire" onClick={() => setConfirme(true)}>
        Supprimer
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-texte-doux">Supprimer « {nom} » ?</span>
      <button
        type="button"
        className="bouton bg-red-600 text-white"
        disabled={enCours}
        onClick={() => demarrer(() => void supprimerVetement(id))}
      >
        {enCours ? 'Suppression…' : 'Confirmer'}
      </button>
      <button type="button" className="bouton-secondaire" onClick={() => setConfirme(false)}>
        Annuler
      </button>
    </div>
  )
}
