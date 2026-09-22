'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  CATEGORIES,
  LIBELLES_CATEGORIE,
  OCCASIONS,
  SAISONS,
  STYLES,
  type Categorie,
} from '@/lib/constantes'
import { urlAffichage } from '@/lib/images'
import { PastilleStatut } from '@/components/BadgeStatut'
import type { Vetement } from '@/lib/db/schema'

type Tri = 'recent' | 'ancien' | 'nom' | 'marque' | 'prix'

type Filtres = {
  recherche: string
  categorie: string
  saison: string
  style: string
  occasion: string
  marque: string
  tri: Tri
}

const FILTRES_VIDES: Filtres = {
  recherche: '',
  categorie: '',
  saison: '',
  style: '',
  occasion: '',
  marque: '',
  tri: 'recent',
}

/**
 * Tout le filtrage se fait en mémoire : la garde-robe entière est déjà chargée.
 * C'est instantané à cette échelle et ça évite des requêtes SQL sur du JSON.
 */
export function GrilleVetements({ vetements }: { vetements: Vetement[] }) {
  const router = useRouter()
  const parametres = useSearchParams()

  const [filtres, setFiltres] = useState<Filtres>(() => ({
    recherche: parametres.get('q') ?? '',
    categorie: parametres.get('categorie') ?? '',
    saison: parametres.get('saison') ?? '',
    style: parametres.get('style') ?? '',
    occasion: parametres.get('occasion') ?? '',
    marque: parametres.get('marque') ?? '',
    tri: (parametres.get('tri') as Tri) ?? 'recent',
  }))

  /** L'URL reflète les filtres pour qu'un lien puisse être mis en favori. */
  function appliquer(modification: Partial<Filtres>) {
    const suivants = { ...filtres, ...modification }
    setFiltres(suivants)

    const requete = new URLSearchParams()
    if (suivants.recherche) requete.set('q', suivants.recherche)
    if (suivants.categorie) requete.set('categorie', suivants.categorie)
    if (suivants.saison) requete.set('saison', suivants.saison)
    if (suivants.style) requete.set('style', suivants.style)
    if (suivants.occasion) requete.set('occasion', suivants.occasion)
    if (suivants.marque) requete.set('marque', suivants.marque)
    if (suivants.tri !== 'recent') requete.set('tri', suivants.tri)

    const chaine = requete.toString()
    router.replace(chaine ? `/?${chaine}` : '/', { scroll: false })
  }

  const marques = useMemo(
    () =>
      [...new Set(vetements.map((v) => v.marque).filter((m): m is string => !!m))].sort((a, b) =>
        a.localeCompare(b, 'fr'),
      ),
    [vetements],
  )

  const resultats = useMemo(() => {
    const recherche = filtres.recherche.trim().toLowerCase()

    const filtres_ = vetements.filter((vetement) => {
      if (filtres.categorie && vetement.categorie !== filtres.categorie) return false
      if (filtres.marque && vetement.marque !== filtres.marque) return false
      if (filtres.saison && !(vetement.saisons ?? []).includes(filtres.saison as never)) return false
      if (filtres.style && !(vetement.styles ?? []).includes(filtres.style as never)) return false
      if (filtres.occasion && !(vetement.occasions ?? []).includes(filtres.occasion as never)) {
        return false
      }
      if (recherche) {
        const corpus = [
          vetement.nom,
          vetement.marque,
          vetement.sousCategorie,
          vetement.couleurPrincipale,
          vetement.matiere,
          vetement.motif,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!corpus.includes(recherche)) return false
      }
      return true
    })

    return filtres_.sort((a, b) => {
      switch (filtres.tri) {
        case 'ancien':
          return a.createdAt - b.createdAt
        case 'nom':
          return a.nom.localeCompare(b.nom, 'fr')
        case 'marque':
          return (a.marque ?? '').localeCompare(b.marque ?? '', 'fr')
        case 'prix':
          return (a.prix ?? 0) - (b.prix ?? 0)
        default:
          return b.createdAt - a.createdAt
      }
    })
  }, [vetements, filtres])

  const filtresActifs =
    filtres.categorie || filtres.saison || filtres.style || filtres.occasion || filtres.marque || filtres.recherche

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[200px] flex-1">
          <span className="etiquette">Rechercher</span>
          <input
            className="champ"
            value={filtres.recherche}
            placeholder="Nom, marque, couleur, matière…"
            onChange={(e) => appliquer({ recherche: e.target.value })}
          />
        </label>

        <Selecteur
          libelle="Catégorie"
          valeur={filtres.categorie}
          options={CATEGORIES.map((c) => ({ valeur: c, libelle: LIBELLES_CATEGORIE[c as Categorie] }))}
          onChange={(categorie) => appliquer({ categorie })}
        />
        <Selecteur
          libelle="Saison"
          valeur={filtres.saison}
          options={SAISONS.map((s) => ({ valeur: s, libelle: s }))}
          onChange={(saison) => appliquer({ saison })}
        />
        <Selecteur
          libelle="Style"
          valeur={filtres.style}
          options={STYLES.map((s) => ({ valeur: s, libelle: s }))}
          onChange={(style) => appliquer({ style })}
        />
        <Selecteur
          libelle="Occasion"
          valeur={filtres.occasion}
          options={OCCASIONS.map((o) => ({ valeur: o, libelle: o }))}
          onChange={(occasion) => appliquer({ occasion })}
        />
        <Selecteur
          libelle="Marque"
          valeur={filtres.marque}
          options={marques.map((m) => ({ valeur: m, libelle: m }))}
          onChange={(marque) => appliquer({ marque })}
        />
        <Selecteur
          libelle="Tri"
          valeur={filtres.tri}
          sansVide
          options={[
            { valeur: 'recent', libelle: 'Plus récents' },
            { valeur: 'ancien', libelle: 'Plus anciens' },
            { valeur: 'nom', libelle: 'Nom' },
            { valeur: 'marque', libelle: 'Marque' },
            { valeur: 'prix', libelle: 'Prix' },
          ]}
          onChange={(tri) => appliquer({ tri: tri as Tri })}
        />

        {filtresActifs && (
          <button
            type="button"
            className="bouton-secondaire"
            onClick={() => {
              setFiltres(FILTRES_VIDES)
              router.replace('/', { scroll: false })
            }}
          >
            Réinitialiser
          </button>
        )}
      </div>

      <p className="text-sm text-texte-doux">
        {resultats.length} vêtement{resultats.length > 1 ? 's' : ''}
        {resultats.length !== vetements.length && ` sur ${vetements.length}`}
      </p>

      {resultats.length === 0 ? (
        <p className="rounded-lg border border-dashed border-bordure p-10 text-center text-sm text-texte-doux">
          {vetements.length === 0
            ? 'Ta garde-robe est vide. Commence par ajouter un vêtement.'
            : 'Aucun vêtement ne correspond à ces filtres.'}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {resultats.map((vetement) => (
            <li key={vetement.id}>
              <Link
                href={`/vetements/${vetement.id}`}
                className="group block overflow-hidden rounded-lg border border-bordure bg-surface transition hover:border-texte-doux"
              >
                <div className="flex aspect-square items-center justify-center overflow-hidden bg-fond">
                  {urlAffichage(vetement) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={urlAffichage(vetement)!}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-contain transition group-hover:scale-105"
                    />
                  ) : (
                    <span className="text-xs text-texte-doux">Sans photo</span>
                  )}
                </div>
                <div className="space-y-0.5 p-3">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">{vetement.nom}</p>
                    <PastilleStatut statut={vetement.statutAnalyse} />
                  </div>
                  <p className="truncate text-xs text-texte-doux">
                    {[LIBELLES_CATEGORIE[vetement.categorie], vetement.marque]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Selecteur({
  libelle,
  valeur,
  options,
  onChange,
  sansVide = false,
}: {
  libelle: string
  valeur: string
  options: { valeur: string; libelle: string }[]
  onChange: (valeur: string) => void
  sansVide?: boolean
}) {
  return (
    <label className="block">
      <span className="etiquette">{libelle}</span>
      <select className="champ w-auto" value={valeur} onChange={(e) => onChange(e.target.value)}>
        {!sansVide && <option value="">Toutes</option>}
        {options.map((option) => (
          <option key={option.valeur} value={option.valeur}>
            {option.libelle}
          </option>
        ))}
      </select>
    </label>
  )
}
