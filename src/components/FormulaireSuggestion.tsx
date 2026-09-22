'use client'

import { useActionState } from 'react'
import { OCCASIONS, SAISONS } from '@/lib/constantes'
import { demanderSuggestions } from '@/lib/actions'

export function FormulaireSuggestion() {
  const [etat, envoyer, enCours] = useActionState(demanderSuggestions, null)

  return (
    <form action={envoyer} className="space-y-4 rounded-lg border border-bordure bg-surface p-4">
      <label className="block">
        <span className="etiquette">Ce que tu cherches</span>
        <textarea
          className="champ resize-y"
          name="texte"
          rows={2}
          placeholder="Par exemple : bureau, plutôt sobre, il fait frais"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="etiquette">Occasion</span>
          <select className="champ" name="occasion" defaultValue="">
            <option value="">Indifférent</option>
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
            <option value="">Indifférent</option>
            {SAISONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      {etat?.erreur && <p className="text-sm text-red-600">{etat.erreur}</p>}

      <button className="bouton" type="submit" disabled={enCours}>
        {enCours ? 'Envoi…' : 'Proposer des tenues'}
      </button>
    </form>
  )
}
