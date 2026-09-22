'use client'

import { useState, useTransition } from 'react'

/**
 * `action` est une action serveur transmise depuis un composant serveur :
 * le même bouton sert pour les vêtements comme pour les tenues.
 */
export function BoutonSupprimer({
  id,
  nom,
  action,
}: {
  id: string
  nom: string
  action: (id: string) => Promise<void>
}) {
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
        onClick={() => demarrer(() => void action(id))}
      >
        {enCours ? 'Suppression…' : 'Confirmer'}
      </button>
      <button type="button" className="bouton-secondaire" onClick={() => setConfirme(false)}>
        Annuler
      </button>
    </div>
  )
}
