'use client'

import { useState } from 'react'
import { enregistrerPrompt } from '@/lib/actions'
import { CIBLES, type CiblePrompt } from '@/lib/prompts-image'

export function PanneauPrompts({
  outfitId,
  generes,
  personnalises,
}: {
  outfitId: string
  generes: Record<CiblePrompt, string>
  personnalises: Record<string, string>
}) {
  const [cible, setCible] = useState<CiblePrompt>('nano_banana')
  const info = CIBLES.find((c) => c.cle === cible)!
  const personnalise = personnalises[cible]

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {CIBLES.map((c) => (
          <button
            key={c.cle}
            type="button"
            onClick={() => setCible(c.cle)}
            className={`rounded-full border px-3 py-1 text-sm transition ${
              cible === c.cle
                ? 'border-texte bg-texte text-fond'
                : 'border-bordure hover:border-texte-doux'
            }`}
          >
            {c.nom}
          </button>
        ))}
      </div>

      <p className="text-xs text-texte-doux">{info.note}</p>

      <EditeurPrompt
        key={cible}
        outfitId={outfitId}
        cible={cible}
        genere={generes[cible]}
        personnalise={personnalise}
      />
    </section>
  )
}

function EditeurPrompt({
  outfitId,
  cible,
  genere,
  personnalise,
}: {
  outfitId: string
  cible: CiblePrompt
  genere: string
  personnalise: string | undefined
}) {
  const [texte, setTexte] = useState(personnalise ?? genere)
  const [copie, setCopie] = useState(false)
  const [enregistrement, setEnregistrement] = useState<'repos' | 'encours' | 'fait'>('repos')

  const modifie = texte !== (personnalise ?? genere)
  const estPersonnalise = personnalise !== undefined

  async function copier() {
    await navigator.clipboard.writeText(texte)
    setCopie(true)
    setTimeout(() => setCopie(false), 2000)
  }

  async function enregistrer(valeur: string) {
    setEnregistrement('encours')
    await enregistrerPrompt(outfitId, cible, valeur)
    setEnregistrement('fait')
    setTimeout(() => setEnregistrement('repos'), 2000)
  }

  return (
    <div className="space-y-2">
      <textarea
        className="champ min-h-56 resize-y font-mono text-xs leading-relaxed"
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
        spellCheck={false}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="bouton" onClick={() => void copier()}>
          {copie ? 'Copié' : 'Copier le prompt'}
        </button>

        {modifie && (
          <button
            type="button"
            className="bouton-secondaire"
            disabled={enregistrement === 'encours'}
            onClick={() => void enregistrer(texte)}
          >
            {enregistrement === 'encours' ? 'Enregistrement…' : 'Enregistrer cette version'}
          </button>
        )}

        {estPersonnalise && !modifie && (
          <button
            type="button"
            className="text-xs text-texte-doux underline hover:text-texte"
            onClick={() => {
              setTexte(genere)
              void enregistrer('')
            }}
          >
            Revenir au prompt généré
          </button>
        )}

        {enregistrement === 'fait' && (
          <span className="text-xs text-emerald-600 dark:text-emerald-400">Enregistré</span>
        )}
      </div>

      {estPersonnalise && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Version personnalisée : elle ne suivra plus les modifications de la composition.
        </p>
      )}
    </div>
  )
}
