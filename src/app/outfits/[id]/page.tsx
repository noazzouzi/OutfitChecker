import Link from 'next/link'
import { notFound } from 'next/navigation'
import { obtenirOutfit, obtenirProfil } from '@/lib/requetes'
import { supprimerOutfit } from '@/lib/actions'
import { urlAffichage, urlImage } from '@/lib/images'
import { LIBELLES_CATEGORIE, type Categorie } from '@/lib/constantes'
import { construirePrompts, nomFichierPack } from '@/lib/prompts-image'
import { PanneauPrompts } from '@/components/PanneauPrompts'
import { PackImages } from '@/components/PackImages'
import { ReimportRendu } from '@/components/ReimportRendu'
import { BoutonSupprimer } from '@/components/BoutonSupprimer'

export const dynamic = 'force-dynamic'

export default async function PageOutfit({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const donnees = await obtenirOutfit(id)
  if (!donnees) notFound()

  const { outfit, pieces } = donnees
  const profil = await obtenirProfil()

  // Recalculés à chaque affichage : les prompts restent cohérents avec la
  // composition. Les versions retouchées à la main sont conservées à part.
  const generes = construirePrompts(pieces, profil)

  // Même source d'ordre que le prompt instructionnel : les numéros du pack et
  // les références « image N » ne peuvent pas diverger.
  const fichiersPack = pieces
    .map((piece, index) => ({
      url: urlAffichage(piece),
      nom: nomFichierPack(piece, index),
    }))
    .filter((f): f is { url: string; nom: string } => f.url !== null)

  const rendu = urlImage(outfit.imageRenduFichier)
  const sansDescription = pieces.filter((p) => !p.descriptionPrompt)

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{outfit.nom}</h1>
          <p className="mt-1 text-sm text-texte-doux">
            {[
              `${pieces.length} pièce${pieces.length > 1 ? 's' : ''}`,
              outfit.occasion,
              outfit.saison,
              outfit.source === 'suggestion_ia'
                ? 'proposée par l’IA'
                : outfit.source === 'outfitcopy'
                  ? 'issue d’OutfitCopy'
                  : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <BoutonSupprimer id={outfit.id} nom={outfit.nom} action={supprimerOutfit} />
      </div>

      {outfit.note && <p className="max-w-2xl text-sm">{outfit.note}</p>}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Pièces</h2>
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
          {pieces.map((piece, index) => (
            <li key={piece.id}>
              <Link
                href={`/vetements/${piece.id}`}
                className="block overflow-hidden rounded-lg border border-bordure bg-surface transition hover:border-texte-doux"
              >
                <div className="relative flex aspect-square items-center justify-center bg-fond">
                  {urlAffichage(piece) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={urlAffichage(piece)!}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="text-xs text-texte-doux">Sans photo</span>
                  )}
                  <span className="absolute left-1.5 top-1.5 rounded bg-texte px-1.5 py-0.5 text-[10px] font-semibold text-fond">
                    image {index + 1}
                  </span>
                </div>
                <div className="space-y-0.5 p-2">
                  <p className="truncate text-xs font-medium">{piece.nom}</p>
                  <p className="truncate text-[11px] text-texte-doux">
                    {LIBELLES_CATEGORIE[piece.categorie as Categorie]}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold">Prompts de génération</h2>
            <p className="mt-1 text-xs text-texte-doux">
              Copie le prompt, télécharge le pack, et glisse les deux dans le générateur.
            </p>
          </div>

          {!profil && (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
              Aucun profil renseigné : le mannequin sera décrit de façon générique.{' '}
              <Link href="/profil" className="underline">
                Compléter le profil
              </Link>
            </p>
          )}

          {sansDescription.length > 0 && (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
              {sansDescription.length} pièce(s) sans description d&apos;IA : elles sont décrites à
              partir de leurs attributs bruts, le rendu sera plus générique.
            </p>
          )}

          <PanneauPrompts
            outfitId={outfit.id}
            generes={generes}
            personnalises={outfit.prompts ?? {}}
          />
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-sm font-semibold">Pack d&apos;images</h2>
            <p className="text-xs text-texte-doux">
              Les fichiers sont numérotés dans le même ordre que les lignes « image N » du
              prompt instructionnel.
            </p>
            <PackImages
              fichiers={fichiersPack}
              nomArchive={`${outfit.nom.replace(/[^\w-]+/g, '-').toLowerCase()}-pack.zip`}
            />
            {fichiersPack.length < pieces.length && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {pieces.length - fichiersPack.length} pièce(s) sans photo ne figureront pas dans
                le pack.
              </p>
            )}
          </div>

          {outfit.referenceImageFichier && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold">Référence OutfitCopy</h2>
              <div className="flex aspect-3/4 items-center justify-center overflow-hidden rounded-lg border border-bordure bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={urlImage(outfit.referenceImageFichier)!}
                  alt=""
                  className="h-full w-full object-contain"
                />
              </div>
              <p className="text-xs text-texte-doux">
                L&apos;image dont cette tenue s&apos;inspire.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <h2 className="text-sm font-semibold">Rendu</h2>
            <div className="flex aspect-3/4 items-center justify-center overflow-hidden rounded-lg border border-bordure bg-surface">
              {rendu ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={rendu} alt="" className="h-full w-full object-contain" />
              ) : (
                <span className="px-6 text-center text-xs text-texte-doux">
                  Pas encore de rendu. Génère l&apos;image, puis importe-la ici.
                </span>
              )}
            </div>
            <ReimportRendu outfitId={outfit.id} dejaRendu={!!outfit.imageRenduFichier} />
          </div>
        </div>
      </section>
    </div>
  )
}
