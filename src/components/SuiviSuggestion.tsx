'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { urlAffichage } from '@/lib/images'
import type { Vetement } from '@/lib/db/schema'

type Proposition = { nom: string; vetementIds: string[]; justification: string }
type Etat = {
  statut: 'en_attente' | 'en_cours' | 'ok' | 'echec' | 'introuvable'
  resultat: { propositions: Proposition[] } | null
  erreur: string | null
}

export function SuiviSuggestion({
  jobId,
  garderobe,
}: {
  jobId: string
  garderobe: Vetement[]
}) {
  const [etat, setEtat] = useState<Etat | null>(null)
  const parId = new Map(garderobe.map((v) => [v.id, v]))

  useEffect(() => {
    let annule = false
    let minuteur: ReturnType<typeof setTimeout>

    async function sonder() {
      try {
        const reponse = await fetch(`/api/jobs/${jobId}`, { cache: 'no-store' })
        if (annule) return

        // Un lien périmé ne doit pas faire tourner le sondage indéfiniment.
        if (reponse.status === 404) {
          setEtat({ statut: 'introuvable', resultat: null, erreur: null })
          return
        }

        if (reponse.ok) {
          const suivant: Etat = await reponse.json()
          setEtat(suivant)
          // Terminé : plus rien à interroger.
          if (suivant.statut === 'ok' || suivant.statut === 'echec') return
        }
      } catch {
        // Worker arrêté ou serveur qui redémarre : on retentera.
      }
      minuteur = setTimeout(sonder, 2000)
    }

    void sonder()
    return () => {
      annule = true
      clearTimeout(minuteur)
    }
  }, [jobId])

  if (!etat || etat.statut === 'en_attente' || etat.statut === 'en_cours') {
    return (
      <div className="rounded-lg border border-bordure bg-surface p-8 text-center">
        <p className="text-sm">Composition en cours…</p>
        <p className="mt-1 text-xs text-texte-doux">
          Le worker interroge le modèle. Compte une trentaine de secondes.
        </p>
      </div>
    )
  }

  if (etat.statut === 'introuvable') {
    return (
      <p className="rounded-lg border border-bordure bg-surface p-4 text-sm text-texte-doux">
        Cette demande n&apos;existe plus. Relance une composition ci-dessus.
      </p>
    )
  }

  if (etat.statut === 'echec') {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm dark:bg-red-950/40">
        <p className="font-medium text-red-700 dark:text-red-400">La composition a échoué.</p>
        {etat.erreur && <p className="mt-1 text-xs text-red-700/80">{etat.erreur.slice(0, 300)}</p>}
      </div>
    )
  }

  const propositions = etat.resultat?.propositions ?? []
  if (propositions.length === 0) {
    return <p className="text-sm text-texte-doux">Aucune proposition exploitable.</p>
  }

  return (
    <div className="space-y-6">
      {propositions.map((proposition, index) => {
        const pieces = proposition.vetementIds
          .map((id) => parId.get(id))
          .filter((v): v is Vetement => !!v)

        const lien =
          `/outfits/nouveau?pieces=${pieces.map((p) => p.id).join(',')}` +
          `&nom=${encodeURIComponent(proposition.nom)}&source=suggestion_ia`

        return (
          <article key={index} className="rounded-lg border border-bordure bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-medium">{proposition.nom}</h3>
                {proposition.justification && (
                  <p className="mt-1 max-w-2xl text-sm text-texte-doux">
                    {proposition.justification}
                  </p>
                )}
              </div>
              <Link className="bouton" href={lien}>
                Créer cette tenue
              </Link>
            </div>

            <ul className="mt-4 flex flex-wrap gap-3">
              {pieces.map((piece) => (
                <li key={piece.id} className="w-24">
                  <div className="flex aspect-square items-center justify-center overflow-hidden rounded-md border border-bordure bg-fond">
                    {urlAffichage(piece) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={urlAffichage(piece)!}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <span className="text-[10px] text-texte-doux">Sans photo</span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs text-texte-doux">{piece.nom}</p>
                </li>
              ))}
            </ul>
          </article>
        )
      })}
    </div>
  )
}
