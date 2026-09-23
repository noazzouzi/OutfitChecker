'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { urlAffichage } from '@/lib/images'
import type { ResultatOutfitCopyComplet } from '@/lib/jobs'
import type { Vetement } from '@/lib/db/schema'
import type { RechercheBoutique } from '@/lib/lefties'

type Etat = {
  statut: 'en_attente' | 'en_cours' | 'ok' | 'echec' | 'introuvable'
  resultat: ResultatOutfitCopyComplet | null
  erreur: string | null
}

export function SuiviOutfitCopy({
  jobId,
  referenceFichier,
  garderobe,
}: {
  jobId: string
  referenceFichier: string | null
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
        if (reponse.status === 404) {
          setEtat({ statut: 'introuvable', resultat: null, erreur: null })
          return
        }
        if (reponse.ok) {
          const suivant: Etat = await reponse.json()
          setEtat(suivant)
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

  if (etat?.statut === 'introuvable') {
    return (
      <p className="rounded-lg border border-bordure bg-surface p-4 text-sm text-texte-doux">
        Cette demande n&apos;existe plus. Envoie une nouvelle image ci-dessus.
      </p>
    )
  }

  if (etat?.statut === 'echec') {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm dark:bg-red-950/40">
        <p className="font-medium text-red-700 dark:text-red-400">L&apos;analyse a échoué.</p>
        {etat.erreur && <p className="mt-1 text-xs text-red-700/80">{etat.erreur.slice(0, 300)}</p>}
      </div>
    )
  }

  const enCours = !etat || etat.statut === 'en_attente' || etat.statut === 'en_cours'

  return (
    <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
      <div className="space-y-3">
        <p className="etiquette">Référence</p>
        <div className="flex aspect-3/4 items-center justify-center overflow-hidden rounded-lg border border-bordure bg-surface">
          {referenceFichier ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/images/${referenceFichier}`}
              alt=""
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="text-xs text-texte-doux">Image indisponible</span>
          )}
        </div>

        {etat?.resultat && (
          <div className="space-y-3 rounded-lg border border-bordure bg-surface p-3">
            <div>
              <p className="etiquette">Ce que l&apos;IA voit</p>
              <p className="text-sm">{etat.resultat.reference.resume}</p>
            </div>
            <ul className="space-y-2">
              {etat.resultat.reference.pieces.map((piece, index) => (
                <li key={index} className="text-xs">
                  <span className="font-medium">{piece.categorie}</span> — {piece.description}
                  {piece.couleur && <span className="text-texte-doux"> · {piece.couleur}</span>}
                  {piece.matiere && <span className="text-texte-doux"> · {piece.matiere}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div>
        {enCours ? (
          <div className="rounded-lg border border-bordure bg-surface p-8 text-center">
            <p className="text-sm">Analyse de la tenue…</p>
            <p className="mt-1 text-xs text-texte-doux">
              Le worker décrit la tenue et cherche les correspondances. Compte une trentaine de
              secondes.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <h2 className="text-sm font-semibold">Avec ce que tu as déjà</h2>
            {etat!.resultat!.propositions.map((proposition, index) => {
              const pieces = proposition.vetementIds
                .map((id) => parId.get(id))
                .filter((v): v is Vetement => !!v)

              const lien =
                `/outfits/nouveau?pieces=${pieces.map((p) => p.id).join(',')}` +
                `&nom=${encodeURIComponent(proposition.nom)}&source=outfitcopy` +
                (referenceFichier ? `&reference=${referenceFichier}` : '')

              return (
                <article key={index} className="rounded-lg border border-bordure bg-surface p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-3">
                        <h3 className="font-medium">{proposition.nom}</h3>
                        <Proximite valeur={proposition.proximite} />
                      </div>
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
                          ) : null}
                        </div>
                        <p className="mt-1 truncate text-xs text-texte-doux">{piece.nom}</p>
                      </li>
                    ))}
                  </ul>
                </article>
              )
            })}

            <Boutique
              resultats={etat!.resultat!.boutique ?? []}
              pieces={etat!.resultat!.reference.pieces}
            />
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Ce qu'on peut acheter pour s'approcher davantage. Les articles viennent du
 * moteur de recherche de Lefties, interrogé avec les requêtes que le modèle a
 * rédigées — pas d'un catalogue stocké localement.
 */
function Boutique({
  resultats,
  pieces,
}: {
  resultats: RechercheBoutique[]
  pieces: { description: string; categorie: string }[]
}) {
  const avecArticles = resultats.filter((r) => r.articles.length > 0)
  if (avecArticles.length === 0) return null

  return (
    <section className="space-y-4 pt-4">
      <div>
        <h2 className="text-sm font-semibold">Ce qui s&apos;en rapproche chez Lefties</h2>
        <p className="mt-1 text-xs text-texte-doux">
          Résultats du moteur de recherche de la boutique, une requête par pièce repérée.
          Un clic sur un article l&apos;importe dans ta garde-robe.
        </p>
      </div>

      {avecArticles.map((resultat) => (
        <div key={resultat.piece} className="space-y-2">
          <p className="etiquette">
            {pieces[resultat.piece]?.categorie ?? 'pièce'} · {resultat.requete}
          </p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {resultat.articles.map((article) => (
              <li key={article.url}>
                <Link
                  href={`/vetements/nouveau?url=${encodeURIComponent(article.url)}`}
                  className="group block overflow-hidden rounded-lg border border-bordure
                             bg-surface transition hover:border-texte-doux"
                >
                  <div className="flex aspect-3/4 items-center justify-center overflow-hidden bg-fond">
                    {article.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={article.image}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-contain transition group-hover:scale-105"
                      />
                    ) : null}
                  </div>
                  <div className="space-y-0.5 p-2">
                    <p className="truncate text-xs font-medium">{article.nom}</p>
                    <p className="text-xs text-texte-doux">
                      {article.prix != null ? `${article.prix.toFixed(2)} €` : '—'}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}

/** La proximité est une estimation du modèle, pas une mesure : on le dit. */
function Proximite({ valeur }: { valeur: number }) {
  const ton =
    valeur >= 70
      ? 'border-emerald-300 text-emerald-700 dark:text-emerald-400'
      : valeur >= 40
        ? 'border-amber-300 text-amber-700 dark:text-amber-400'
        : 'border-bordure text-texte-doux'

  return (
    <span
      title="Proximité estimée par le modèle avec la tenue de référence"
      className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${ton}`}
    >
      ~{valeur} % de proximité
    </span>
  )
}
