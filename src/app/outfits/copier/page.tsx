import Link from 'next/link'
import { listerVetements } from '@/lib/requetes'
import { obtenirJob, type PayloadOutfitCopy } from '@/lib/jobs'
import { FormulaireOutfitCopy } from '@/components/FormulaireOutfitCopy'
import { SuiviOutfitCopy } from '@/components/SuiviOutfitCopy'

export const dynamic = 'force-dynamic'

export default async function PageOutfitCopy({
  searchParams,
}: {
  searchParams: Promise<{ job?: string }>
}) {
  const { job } = await searchParams
  const vetements = await listerVetements()

  // Le nom de l'image vit dans la charge du job : on le lit ici plutôt que de
  // l'exposer dans la route de sondage.
  const enregistrement = job ? await obtenirJob(job) : null
  const referenceFichier =
    (enregistrement?.payload as PayloadOutfitCopy | null)?.referenceImageFichier ?? null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">OutfitCopy</h1>
        <p className="mt-1 max-w-2xl text-sm text-texte-doux">
          Donne une photo de quelqu&apos;un dont la tenue t&apos;inspire. L&apos;IA décrit ce
          qu&apos;elle porte, puis cherche les combinaisons les plus proches parmi{' '}
          <Link href="/" className="underline">
            tes propres vêtements
          </Link>
          .
        </p>
      </div>

      {vetements.length < 2 && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
          Il faut au moins deux vêtements dans ta garde-robe pour que la comparaison ait un sens.{' '}
          <Link href="/vetements/nouveau" className="underline">
            Ajouter un vêtement
          </Link>
        </p>
      )}

      <FormulaireOutfitCopy />

      {job && (
        <SuiviOutfitCopy
          jobId={job}
          referenceFichier={referenceFichier}
          garderobe={vetements}
        />
      )}
    </div>
  )
}
