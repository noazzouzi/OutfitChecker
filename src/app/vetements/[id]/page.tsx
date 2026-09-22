import Link from 'next/link'
import { notFound } from 'next/navigation'
import { obtenirVetement } from '@/lib/requetes'
import { urlAffichage, urlImage } from '@/lib/images'
import { LIBELLES_CATEGORIE } from '@/lib/constantes'
import { BoutonDetourage } from '@/components/BoutonDetourage'
import { BoutonSupprimer } from '@/components/BoutonSupprimer'
import { supprimerVetement } from '@/lib/actions'
import { BoutonAnalyse } from '@/components/BoutonAnalyse'
import { BadgeStatut } from '@/components/BadgeStatut'

export const dynamic = 'force-dynamic'

export default async function PageVetement({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const vetement = await obtenirVetement(id)
  if (!vetement) notFound()

  const image = urlAffichage(vetement)
  const originale = urlImage(vetement.imageFichier)

  const attributs: [string, string | null][] = [
    ['Catégorie', LIBELLES_CATEGORIE[vetement.categorie]],
    ['Sous-catégorie', vetement.sousCategorie],
    ['Marque', vetement.marque],
    ['Taille', vetement.taille],
    ['Prix', vetement.prix != null ? `${vetement.prix} €` : null],
    ['Couleur', vetement.couleurPrincipale],
    ['Matière', vetement.matiere],
    ['Coupe', vetement.coupe],
    ['Motif', vetement.motif],
    ['Boutique', vetement.boutique],
  ]

  const listes: [string, string[] | null][] = [
    ['Saisons', vetement.saisons],
    ['Styles', vetement.styles],
    ['Occasions', vetement.occasions],
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{vetement.nom}</h1>
          <BadgeStatut statut={vetement.statutAnalyse} />
        </div>
        <div className="flex items-center gap-2">
          <Link className="bouton-secondaire" href={`/vetements/${vetement.id}/modifier`}>
            Modifier
          </Link>
          <BoutonSupprimer id={vetement.id} nom={vetement.nom} action={supprimerVetement} />
        </div>
      </div>

      <div className="grid gap-8 md:grid-cols-[320px_1fr]">
        <div className="space-y-3">
          <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-bordure bg-surface">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="" className="h-full w-full object-contain" />
            ) : (
              <span className="text-xs text-texte-doux">Aucune photo</span>
            )}
          </div>

          {originale && (
            <>
              <BoutonAnalyse
                id={vetement.id}
                statut={vetement.statutAnalyse}
                dejaAnalyse={!!vetement.descriptionPrompt}
              />
              <BoutonDetourage
                id={vetement.id}
                urlSource={originale}
                dejaDetoure={!!vetement.imageDetoureeFichier}
              />
            </>
          )}
          {vetement.imageDetoureeFichier && (
            <p className="text-xs text-texte-doux">Photo détourée, prête pour la génération.</p>
          )}
        </div>

        <div className="space-y-6">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
            {attributs
              .filter(([, valeur]) => valeur)
              .map(([libelle, valeur]) => (
                <div key={libelle}>
                  <dt className="etiquette">{libelle}</dt>
                  <dd className="text-sm">{valeur}</dd>
                </div>
              ))}
          </dl>

          {listes
            .filter(([, valeurs]) => valeurs && valeurs.length > 0)
            .map(([libelle, valeurs]) => (
              <div key={libelle}>
                <p className="etiquette">{libelle}</p>
                <div className="flex flex-wrap gap-2">
                  {valeurs!.map((valeur) => (
                    <span
                      key={valeur}
                      className="rounded-full border border-bordure px-3 py-1 text-sm"
                    >
                      {valeur}
                    </span>
                  ))}
                </div>
              </div>
            ))}

          {vetement.descriptionPrompt && (
            <div>
              <p className="etiquette">Description pour génération d&apos;image</p>
              <p className="rounded-md border border-bordure bg-surface p-3 text-sm">
                {vetement.descriptionPrompt}
              </p>
            </div>
          )}

          {vetement.urlSource && (
            <a
              className="inline-block text-sm text-texte-doux underline hover:text-texte"
              href={vetement.urlSource}
              target="_blank"
              rel="noreferrer noopener"
            >
              Voir la fiche produit
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
