'use client'

import { useActionState } from 'react'
import { enregistrerProfil } from '@/lib/actions'
import { Texte, ZoneTexte } from '@/components/champs'
import type { Profil } from '@/lib/db/schema'

export function FormulaireProfil({ profil }: { profil: Profil | null }) {
  const [etat, envoyer, enCours] = useActionState(enregistrerProfil, null)

  return (
    <form action={envoyer} className="max-w-2xl space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Texte nom="tailleCm" libelle="Taille (cm)" defaut={profil?.tailleCm?.toString()} />
        <Texte nom="poidsKg" libelle="Poids (kg)" defaut={profil?.poidsKg?.toString()} />
        <Texte nom="pointure" libelle="Pointure" defaut={profil?.pointure?.toString()} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Texte
          nom="morphotype"
          libelle="Morphotype"
          defaut={profil?.morphotype}
          placeholder="athlétique, longiligne…"
        />
        <Texte
          nom="genrePresentation"
          libelle="Présentation"
          defaut={profil?.genrePresentation}
          placeholder="homme, femme, non genré…"
        />
        <Texte nom="teint" libelle="Teint" defaut={profil?.teint} placeholder="clair, mat…" />
        <Texte
          nom="cheveux"
          libelle="Cheveux"
          defaut={profil?.cheveux}
          placeholder="bruns courts…"
        />
      </div>

      <ZoneTexte
        nom="notesStyle"
        libelle="Notes de style"
        defaut={profil?.notesStyle}
        lignes={4}
        aide="Préférences libres. Elles seront injectées dans les prompts de génération d'image."
      />

      {etat?.erreur && (
        <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40">
          {etat.erreur}
        </p>
      )}

      <button className="bouton" type="submit" disabled={enCours}>
        {enCours ? 'Enregistrement…' : 'Enregistrer le profil'}
      </button>
    </form>
  )
}
