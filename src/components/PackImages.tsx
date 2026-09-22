'use client'

import { useState } from 'react'

export type FichierPack = { url: string; nom: string }

/**
 * Assemble le pack d'images à glisser dans le générateur.
 *
 * Les noms sont numérotés côté serveur, dans le même ordre que les lignes
 * « image N » du prompt instructionnel. Le ZIP est construit dans le
 * navigateur : le serveur n'a rien à assembler ni à stocker.
 */
export function PackImages({ fichiers, nomArchive }: { fichiers: FichierPack[]; nomArchive: string }) {
  const [etat, setEtat] = useState<'repos' | 'encours'>('repos')
  const [erreur, setErreur] = useState<string | null>(null)

  async function telecharger() {
    setEtat('encours')
    setErreur(null)
    try {
      const { default: JSZip } = await import('jszip')
      const zip = new JSZip()

      for (const fichier of fichiers) {
        const reponse = await fetch(fichier.url)
        if (!reponse.ok) throw new Error(`Image inaccessible : ${fichier.nom}`)
        zip.file(fichier.nom, await reponse.blob())
      }

      const archive = await zip.generateAsync({ type: 'blob' })
      const lien = document.createElement('a')
      lien.href = URL.createObjectURL(archive)
      lien.download = nomArchive
      lien.click()
      URL.revokeObjectURL(lien.href)
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Le pack n’a pas pu être constitué.')
    }
    setEtat('repos')
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        className="bouton-secondaire"
        onClick={() => void telecharger()}
        disabled={etat === 'encours' || fichiers.length === 0}
      >
        {etat === 'encours'
          ? 'Préparation…'
          : `Télécharger le pack (${fichiers.length} image${fichiers.length > 1 ? 's' : ''})`}
      </button>
      {erreur && <p className="text-xs text-red-600">{erreur}</p>}
    </div>
  )
}
