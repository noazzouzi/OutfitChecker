import { Suspense } from 'react'
import { listerVetements } from '@/lib/requetes'
import { etatFile } from '@/lib/jobs'
import { GrilleVetements } from '@/components/GrilleVetements'
import { SuiviFile } from '@/components/SuiviFile'

// Les données changent à chaque ajout : aucun intérêt à prérendre la page.
export const dynamic = 'force-dynamic'

export default async function PageGardeRobe() {
  const [vetements, file] = await Promise.all([listerVetements(), etatFile()])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Garde-robe</h1>
      <SuiviFile etatInitial={file} />
      {/* GrilleVetements lit l'URL (useSearchParams) : Suspense est requis. */}
      <Suspense fallback={<p className="text-sm text-texte-doux">Chargement…</p>}>
        <GrilleVetements vetements={vetements} />
      </Suspense>
    </div>
  )
}
