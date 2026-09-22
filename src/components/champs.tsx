'use client'

import { CATEGORIES, LIBELLES_CATEGORIE } from '@/lib/constantes'

export function Texte({
  nom,
  libelle,
  defaut,
  type = 'text',
  requis = false,
  placeholder,
}: {
  nom: string
  libelle: string
  defaut?: string | null
  type?: string
  requis?: boolean
  placeholder?: string
}) {
  return (
    <label className="block">
      <span className="etiquette">
        {libelle}
        {requis && <span className="text-red-500"> *</span>}
      </span>
      <input
        className="champ"
        name={nom}
        type={type}
        required={requis}
        placeholder={placeholder}
        defaultValue={defaut ?? ''}
      />
    </label>
  )
}

export function ZoneTexte({
  nom,
  libelle,
  defaut,
  aide,
  lignes = 3,
}: {
  nom: string
  libelle: string
  defaut?: string | null
  aide?: string
  lignes?: number
}) {
  return (
    <label className="block">
      <span className="etiquette">{libelle}</span>
      <textarea className="champ resize-y" name={nom} rows={lignes} defaultValue={defaut ?? ''} />
      {aide && <span className="mt-1 block text-xs text-texte-doux">{aide}</span>}
    </label>
  )
}

export function ChoixCategorie({ defaut }: { defaut?: string | null }) {
  return (
    <label className="block">
      <span className="etiquette">
        Catégorie<span className="text-red-500"> *</span>
      </span>
      <select className="champ" name="categorie" required defaultValue={defaut ?? ''}>
        <option value="" disabled>
          Choisir…
        </option>
        {CATEGORIES.map((categorie) => (
          <option key={categorie} value={categorie}>
            {LIBELLES_CATEGORIE[categorie]}
          </option>
        ))}
      </select>
    </label>
  )
}

/**
 * Cases à cocher multiples. Les valeurs sont relues côté serveur avec
 * `formData.getAll(nom)` — pas besoin d'état React.
 */
export function GroupeCases({
  nom,
  libelle,
  options,
  defaut = [],
}: {
  nom: string
  libelle: string
  options: readonly string[]
  defaut?: readonly string[]
}) {
  return (
    <fieldset>
      <legend className="etiquette">{libelle}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label
            key={option}
            className="cursor-pointer rounded-full border border-bordure bg-surface px-3 py-1
                       text-sm transition hover:border-texte-doux
                       has-checked:border-texte has-checked:bg-texte has-checked:text-fond"
          >
            <input
              type="checkbox"
              name={nom}
              value={option}
              defaultChecked={defaut.includes(option)}
              className="sr-only"
            />
            {option}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
