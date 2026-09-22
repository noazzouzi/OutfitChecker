'use client'

import { useActionState, useState } from 'react'
import { lancerOutfitCopy } from '@/lib/actions'

export function FormulaireOutfitCopy() {
  const [etat, envoyer, enCours] = useActionState(lancerOutfitCopy, null)
  const [apercu, setApercu] = useState<string | null>(null)

  return (
    <form action={envoyer} className="space-y-4 rounded-lg border border-bordure bg-surface p-4">
      <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
        <div
          className="flex aspect-3/4 items-center justify-center overflow-hidden rounded-lg
                     border border-dashed border-bordure bg-fond"
        >
          {apercu ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={apercu} alt="" className="h-full w-full object-contain" />
          ) : (
            <span className="px-4 text-center text-xs text-texte-doux">
              Aperçu de la référence
            </span>
          )}
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="etiquette">Image de référence</span>
            <input
              className="champ"
              type="file"
              name="fichier"
              accept="image/*"
              required
              onChange={(evenement) => {
                const fichier = evenement.target.files?.[0]
                setApercu(fichier ? URL.createObjectURL(fichier) : null)
              }}
            />
          </label>
          <p className="text-xs text-texte-doux">
            Une photo de quelqu&apos;un dont la tenue t&apos;inspire — personne réelle ou
            personnage. L&apos;IA décrit ce qu&apos;elle porte, puis cherche ce qui s&apos;en
            approche le plus dans ta garde-robe.
          </p>

          {etat?.erreur && <p className="text-sm text-red-600">{etat.erreur}</p>}

          <button className="bouton" type="submit" disabled={enCours}>
            {enCours ? 'Envoi…' : 'Chercher dans ma garde-robe'}
          </button>
        </div>
      </div>
    </form>
  )
}
