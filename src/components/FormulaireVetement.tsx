'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { OCCASIONS, SAISONS, STYLES } from '@/lib/constantes'
import { urlImage } from '@/lib/images'
import { importerDepuisUrl, type EtatFormulaire } from '@/lib/actions'
import type { Vetement } from '@/lib/db/schema'
import { ChoixCategorie, GroupeCases, Texte, ZoneTexte } from '@/components/champs'

type Action = (precedent: EtatFormulaire, formData: FormData) => Promise<EtatFormulaire>

type Valeurs = {
  nom: string
  categorie: string
  marque: string
  taille: string
  prix: string
  urlSource: string
  boutique: string
  sousCategorie: string
  couleurPrincipale: string
  matiere: string
  coupe: string
  motif: string
  descriptionPrompt: string
  descriptionBoutique: string
  saisons: string[]
  styles: string[]
  occasions: string[]
  imageFichier: string | null
}

const VALEURS_VIDES: Valeurs = {
  nom: '',
  categorie: '',
  marque: '',
  taille: '',
  prix: '',
  urlSource: '',
  boutique: '',
  sousCategorie: '',
  couleurPrincipale: '',
  matiere: '',
  coupe: '',
  motif: '',
  descriptionPrompt: '',
  descriptionBoutique: '',
  saisons: [],
  styles: [],
  occasions: [],
  imageFichier: null,
}

function depuisVetement(vetement: Vetement): Valeurs {
  return {
    nom: vetement.nom,
    categorie: vetement.categorie,
    marque: vetement.marque ?? '',
    taille: vetement.taille ?? '',
    prix: vetement.prix != null ? String(vetement.prix) : '',
    urlSource: vetement.urlSource ?? '',
    boutique: vetement.boutique ?? '',
    sousCategorie: vetement.sousCategorie ?? '',
    couleurPrincipale: vetement.couleurPrincipale ?? '',
    matiere: vetement.matiere ?? '',
    coupe: vetement.coupe ?? '',
    motif: vetement.motif ?? '',
    descriptionPrompt: vetement.descriptionPrompt ?? '',
    descriptionBoutique: vetement.descriptionBoutique ?? '',
    saisons: vetement.saisons ?? [],
    styles: vetement.styles ?? [],
    occasions: vetement.occasions ?? [],
    imageFichier: vetement.imageFichier,
  }
}

export function FormulaireVetement({
  action,
  vetement,
}: {
  action: Action
  vetement?: Vetement
}) {
  const [etat, envoyer, enCours] = useActionState(action, null)

  const [valeurs, setValeurs] = useState<Valeurs>(
    vetement ? depuisVetement(vetement) : VALEURS_VIDES,
  )
  /** Incrémentée après un import : force le remontage pour réinitialiser les champs. */
  const [cle, setCle] = useState(0)
  const [apercuLocal, setApercuLocal] = useState<string | null>(null)

  const apercu = apercuLocal ?? urlImage(valeurs.imageFichier)

  return (
    <div className="space-y-8">
      {!vetement && (
        <ImportUrl
          onImport={(nouvelles) => {
            setValeurs({ ...VALEURS_VIDES, ...nouvelles })
            setApercuLocal(null)
            setCle((c) => c + 1)
          }}
        />
      )}

      <form key={cle} action={envoyer} className="space-y-8">
        {vetement && <input type="hidden" name="id" value={vetement.id} />}
        {valeurs.imageFichier && (
          <input type="hidden" name="imageFichier" value={valeurs.imageFichier} />
        )}

        <section className="grid gap-6 md:grid-cols-[220px_1fr]">
          <div className="space-y-3">
            <span className="etiquette">Photo</span>
            <div
              className="flex aspect-square items-center justify-center overflow-hidden
                         rounded-lg border border-dashed border-bordure bg-surface"
            >
              {apercu ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={apercu} alt="" className="h-full w-full object-contain" />
              ) : (
                <span className="px-4 text-center text-xs text-texte-doux">
                  Aucune photo
                </span>
              )}
            </div>
            <input
              className="champ"
              type="file"
              name="fichier"
              accept="image/*"
              onChange={(evenement) => {
                const fichier = evenement.target.files?.[0]
                setApercuLocal(fichier ? URL.createObjectURL(fichier) : null)
              }}
            />
            {vetement && (
              <p className="text-xs text-texte-doux">
                Remplacer la photo supprime le détourage existant.
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Texte nom="nom" libelle="Nom" defaut={valeurs.nom} requis />
            </div>
            <ChoixCategorie defaut={valeurs.categorie} />
            <Texte nom="sousCategorie" libelle="Sous-catégorie" defaut={valeurs.sousCategorie} />
            <Texte nom="marque" libelle="Marque" defaut={valeurs.marque} />
            <Texte nom="taille" libelle="Taille" defaut={valeurs.taille} />
            <Texte nom="prix" libelle="Prix (€)" defaut={valeurs.prix} />
            <Texte nom="boutique" libelle="Boutique" defaut={valeurs.boutique} />
            <div className="sm:col-span-2">
              <Texte nom="urlSource" libelle="URL source" defaut={valeurs.urlSource} />
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          <Texte
            nom="couleurPrincipale"
            libelle="Couleur principale"
            defaut={valeurs.couleurPrincipale}
          />
          <Texte nom="matiere" libelle="Matière" defaut={valeurs.matiere} />
          <Texte nom="coupe" libelle="Coupe" defaut={valeurs.coupe} />
          <Texte nom="motif" libelle="Motif" defaut={valeurs.motif} />
        </section>

        <section className="space-y-5">
          <GroupeCases nom="saisons" libelle="Saisons" options={SAISONS} defaut={valeurs.saisons} />
          <GroupeCases nom="styles" libelle="Styles" options={STYLES} defaut={valeurs.styles} />
          <GroupeCases
            nom="occasions"
            libelle="Occasions"
            options={OCCASIONS}
            defaut={valeurs.occasions}
          />
        </section>

        <ZoneTexte
          nom="descriptionPrompt"
          libelle="Description pour génération d'image"
          defaut={valeurs.descriptionPrompt}
          aide="Phrase visuelle dense, destinée à un générateur d'image. L'IA la rédigera automatiquement au lot 2."
        />

        {etat?.erreur && (
          <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40">
            {etat.erreur}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button className="bouton" type="submit" disabled={enCours}>
            {enCours ? 'Enregistrement…' : vetement ? 'Enregistrer' : 'Ajouter le vêtement'}
          </button>
          <Link className="bouton-secondaire" href={vetement ? `/vetements/${vetement.id}` : '/'}>
            Annuler
          </Link>
        </div>
      </form>
    </div>
  )
}

function ImportUrl({ onImport }: { onImport: (valeurs: Partial<Valeurs>) => void }) {
  const [url, setUrl] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [message, setMessage] = useState<{ type: 'ok' | 'erreur'; texte: string } | null>(null)

  async function recuperer() {
    if (!url.trim()) return
    setEnCours(true)
    setMessage(null)

    const resultat = await importerDepuisUrl(url.trim())

    if (!resultat.ok) {
      setMessage({ type: 'erreur', texte: resultat.erreur })
    } else {
      const { fiche, imageFichier } = resultat
      onImport({
        nom: fiche.nom ?? '',
        marque: fiche.marque ?? '',
        prix: fiche.prix != null ? String(fiche.prix) : '',
        boutique: fiche.boutique ?? '',
        descriptionBoutique: fiche.description ?? '',
        urlSource: url.trim(),
        imageFichier,
      })
      const viaNavigateur =
        fiche.lecture === 'navigateur'
          ? ' Cette boutique bloque les requêtes automatiques : la page a été lue dans un navigateur, ce qui prend quelques secondes.'
          : ''
      setMessage({
        type: 'ok',
        texte:
          (fiche.source === 'json-ld'
            ? 'Fiche produit lue. Vérifie les champs avant d’enregistrer.'
            : 'Données limitées (pas de fiche structurée sur cette page). Complète à la main.') +
          viaNavigateur,
      })
    }
    setEnCours(false)
  }

  return (
    <section className="rounded-lg border border-bordure bg-surface p-4">
      <h2 className="text-sm font-semibold">Importer depuis une boutique</h2>
      <p className="mt-1 text-xs text-texte-doux">
        Colle l’URL d’une fiche produit. Les champs sont pré-remplis, à toi de valider.
        Sur les boutiques protégées (Lefties, Zara…), la lecture passe par un navigateur
        et demande quelques secondes.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          className="champ"
          type="url"
          value={url}
          placeholder="https://…"
          onChange={(evenement) => setUrl(evenement.target.value)}
          onKeyDown={(evenement) => {
            if (evenement.key === 'Enter') {
              evenement.preventDefault()
              void recuperer()
            }
          }}
        />
        <button
          type="button"
          className="bouton whitespace-nowrap"
          onClick={() => void recuperer()}
          disabled={enCours || url.trim().length === 0}
        >
          {enCours ? 'Lecture…' : 'Récupérer'}
        </button>
      </div>
      {message && (
        <p
          className={`mt-3 text-sm ${
            message.type === 'erreur' ? 'text-red-600' : 'text-texte-doux'
          }`}
        >
          {message.texte}
        </p>
      )}
    </section>
  )
}
