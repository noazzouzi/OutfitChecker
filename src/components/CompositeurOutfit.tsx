'use client'

import { useActionState, useMemo, useState } from 'react'
import Link from 'next/link'
import { CATEGORIES, LIBELLES_CATEGORIE, OCCASIONS, SAISONS } from '@/lib/constantes'
import { urlAffichage } from '@/lib/images'
import { creerOutfit } from '@/lib/actions'
import type { Vetement } from '@/lib/db/schema'
import { Texte, ZoneTexte } from '@/components/champs'

export function CompositeurOutfit({
  vetements,
  preselection = [],
  nomPropose = '',
  source = 'manuel',
}: {
  vetements: Vetement[]
  preselection?: string[]
  nomPropose?: string
  source?: string
}) {
  const [etat, envoyer, enCours] = useActionState(creerOutfit, null)
  const [choisis, setChoisis] = useState<string[]>(preselection)

  const parCategorie = useMemo(
    () =>
      CATEGORIES.map((categorie) => ({
        categorie,
        pieces: vetements.filter((v) => v.categorie === categorie),
      })).filter((groupe) => groupe.pieces.length > 0),
    [vetements],
  )

  function basculer(id: string) {
    setChoisis((actuels) =>
      actuels.includes(id) ? actuels.filter((x) => x !== id) : [...actuels, id],
    )
  }

  return (
    <form action={envoyer} className="space-y-8">
      <input type="hidden" name="source" value={source} />
      {choisis.map((id) => (
        <input key={id} type="hidden" name="vetementIds" value={id} />
      ))}

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Texte nom="nom" libelle="Nom de la tenue" defaut={nomPropose} requis />
        </div>
        <label className="block">
          <span className="etiquette">Occasion</span>
          <select className="champ" name="occasion" defaultValue="">
            <option value="">—</option>
            {OCCASIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="etiquette">Saison</span>
          <select className="champ" name="saison" defaultValue="">
            <option value="">—</option>
            {SAISONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <div className="sm:col-span-2">
          <ZoneTexte nom="note" libelle="Note" lignes={2} />
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">Pièces</h2>
          <span className="text-xs text-texte-doux">
            {choisis.length} sélectionnée{choisis.length > 1 ? 's' : ''}
          </span>
        </div>

        {parCategorie.length === 0 && (
          <p className="rounded-lg border border-dashed border-bordure p-8 text-center text-sm text-texte-doux">
            Ta garde-robe est vide. <Link href="/vetements/nouveau" className="underline">Ajoute un vêtement</Link> d&apos;abord.
          </p>
        )}

        {parCategorie.map(({ categorie, pieces }) => (
          <div key={categorie} className="space-y-2">
            <p className="etiquette">{LIBELLES_CATEGORIE[categorie]}</p>
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-6">
              {pieces.map((piece) => {
                const actif = choisis.includes(piece.id)
                return (
                  <li key={piece.id}>
                    <button
                      type="button"
                      onClick={() => basculer(piece.id)}
                      aria-pressed={actif}
                      className={`w-full overflow-hidden rounded-lg border text-left transition ${
                        actif
                          ? 'border-texte ring-2 ring-texte'
                          : 'border-bordure hover:border-texte-doux'
                      }`}
                    >
                      <div className="flex aspect-square items-center justify-center bg-fond">
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
                      <p className="truncate px-2 py-1.5 text-xs">{piece.nom}</p>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </section>

      {etat?.erreur && (
        <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40">
          {etat.erreur}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button className="bouton" type="submit" disabled={enCours || choisis.length < 2}>
          {enCours ? 'Création…' : 'Créer la tenue'}
        </button>
        <Link className="bouton-secondaire" href="/outfits">
          Annuler
        </Link>
      </div>
    </form>
  )
}
