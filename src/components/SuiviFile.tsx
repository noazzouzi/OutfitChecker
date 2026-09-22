'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { EtatFile } from '@/lib/jobs'

/**
 * Bandeau d'état de la file d'analyse.
 *
 * Le worker écrit en base depuis un autre process : le serveur Next n'a aucun
 * moyen d'en être notifié. On interroge donc une petite route, et on rafraîchit
 * la page quand la file se vide — c'est à ce moment que les nouveaux attributs
 * deviennent visibles.
 */
export function SuiviFile({ etatInitial }: { etatInitial: EtatFile }) {
  const router = useRouter()
  const [etat, setEtat] = useState(etatInitial)
  /**
   * L'heure de reprise est formatée ici plutôt que pendant le rendu : le
   * formatage dépend des données de locale, qui ne sont pas garanties
   * identiques entre le rendu serveur et le navigateur. Elle apparaît donc au
   * premier sondage, quelques secondes après l'affichage du bandeau.
   */
  const [heureReprise, setHeureReprise] = useState<string | null>(null)
  const actifPrecedent = useRef(etatInitial.enAttente + etatInitial.enCours)

  useEffect(() => {
    let annule = false

    async function sonder() {
      try {
        const reponse = await fetch('/api/file', { cache: 'no-store' })
        if (!reponse.ok || annule) return
        const suivant: EtatFile = await reponse.json()
        setEtat(suivant)
        setHeureReprise(
          suivant.prochaineRepriseA
            ? new Date(suivant.prochaineRepriseA).toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit',
              })
            : null,
        )

        const actif = suivant.enAttente + suivant.enCours
        // La file vient de se vider : les attributs analysés sont en base.
        if (actifPrecedent.current > 0 && actif === 0) router.refresh()
        actifPrecedent.current = actif
      } catch {
        // Worker arrêté ou serveur qui redémarre : on retentera.
      }
    }

    const minuteur = setInterval(sonder, 4000)
    return () => {
      annule = true
      clearInterval(minuteur)
    }
  }, [router])

  const actif = etat.enAttente + etat.enCours
  if (actif === 0 && etat.echec === 0) return null

  return (
    <div className="rounded-lg border border-bordure bg-surface px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {etat.enCours > 0 && (
          <span className="font-medium text-blue-600 dark:text-blue-400">
            Analyse en cours…
          </span>
        )}
        {etat.enAttente > 0 && (
          <span className="text-texte-doux">
            {etat.enAttente} vêtement{etat.enAttente > 1 ? 's' : ''} en attente d&apos;analyse
          </span>
        )}
        {etat.echec > 0 && (
          <span className="text-red-600 dark:text-red-400">
            {etat.echec} analyse{etat.echec > 1 ? 's' : ''} en échec
          </span>
        )}
      </div>

      {etat.enPause && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          File en pause{heureReprise && ` — reprise vers ${heureReprise}`}. C&apos;est
          généralement le quota d&apos;abonnement qui est atteint.
        </p>
      )}

      {!etat.enPause && actif === 0 && etat.dernierMessage && (
        <p className="mt-2 text-xs text-texte-doux">{etat.dernierMessage.slice(0, 220)}</p>
      )}
    </div>
  )
}
