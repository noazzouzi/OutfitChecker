'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { relancerAnalyse } from '@/lib/actions'
import type { StatutAnalyse } from '@/lib/constantes'

export function BoutonAnalyse({
  id,
  statut,
  dejaAnalyse,
}: {
  id: string
  statut: StatutAnalyse
  dejaAnalyse: boolean
}) {
  const router = useRouter()
  const [enCours, demarrer] = useTransition()
  const enFile = statut === 'en_attente' || statut === 'en_cours'

  function lancer(ecraser: boolean) {
    demarrer(async () => {
      await relancerAnalyse(id, ecraser)
      router.refresh()
    })
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="bouton-secondaire w-full"
        disabled={enCours || enFile}
        onClick={() => lancer(false)}
      >
        {enFile
          ? 'Analyse en file…'
          : statut === 'echec'
            ? 'Relancer l’analyse'
            : dejaAnalyse
              ? 'Compléter les champs vides'
              : 'Analyser avec l’IA'}
      </button>

      {dejaAnalyse && !enFile && (
        <button
          type="button"
          className="w-full text-xs text-texte-doux underline hover:text-texte"
          disabled={enCours}
          onClick={() => lancer(true)}
        >
          Réanalyser en écrasant les valeurs existantes
        </button>
      )}
    </div>
  )
}
