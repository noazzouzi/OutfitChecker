import Link from 'next/link'
import { listerOutfits } from '@/lib/requetes'
import { urlAffichage, urlImage } from '@/lib/images'

export const dynamic = 'force-dynamic'

export default async function PageOutfits() {
  const outfits = await listerOutfits()

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Tenues</h1>
        <div className="flex items-center gap-2">
          <Link className="bouton-secondaire" href="/outfits/copier">
            OutfitCopy
          </Link>
          <Link className="bouton-secondaire" href="/outfits/suggerer">
            Demander à l&apos;IA
          </Link>
          <Link className="bouton" href="/outfits/nouveau">
            Composer
          </Link>
        </div>
      </div>

      {outfits.length === 0 ? (
        <p className="rounded-lg border border-dashed border-bordure p-10 text-center text-sm text-texte-doux">
          Aucune tenue pour l&apos;instant. Compose-en une, ou demande des propositions à l&apos;IA.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {outfits.map(({ outfit, pieces }) => {
            const rendu = urlImage(outfit.imageRenduFichier)
            return (
              <li key={outfit.id}>
                <Link
                  href={`/outfits/${outfit.id}`}
                  className="block overflow-hidden rounded-lg border border-bordure bg-surface transition hover:border-texte-doux"
                >
                  <div className="flex aspect-4/3 items-center justify-center gap-1 bg-fond p-2">
                    {rendu ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={rendu} alt="" className="h-full w-full object-contain" />
                    ) : pieces.length > 0 ? (
                      pieces.slice(0, 4).map((piece) => (
                        <div key={piece.id} className="flex h-full flex-1 items-center justify-center">
                          {urlAffichage(piece) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={urlAffichage(piece)!}
                              alt=""
                              loading="lazy"
                              className="max-h-full max-w-full object-contain"
                            />
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <span className="text-xs text-texte-doux">Tenue vide</span>
                    )}
                  </div>
                  <div className="space-y-0.5 p-3">
                    <p className="truncate text-sm font-medium">{outfit.nom}</p>
                    <p className="truncate text-xs text-texte-doux">
                      {[
                        `${pieces.length} pièce${pieces.length > 1 ? 's' : ''}`,
                        outfit.occasion,
                        outfit.saison,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
