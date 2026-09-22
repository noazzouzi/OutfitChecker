import Link from 'next/link'
import { listerVetements } from '@/lib/requetes'
import { FormulaireSuggestion } from '@/components/FormulaireSuggestion'
import { SuiviSuggestion } from '@/components/SuiviSuggestion'

export const dynamic = 'force-dynamic'

export default async function PageSuggestion({
  searchParams,
}: {
  searchParams: Promise<{ job?: string }>
}) {
  const { job } = await searchParams
  const vetements = await listerVetements()
  const analyses = vetements.filter((v) => v.statutAnalyse === 'ok').length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Demander des tenues à l&apos;IA</h1>
        <p className="mt-1 max-w-2xl text-sm text-texte-doux">
          L&apos;IA reçoit ta garde-robe décrite en texte — pas les photos — et propose des
          combinaisons de pièces que tu possèdes réellement.
        </p>
      </div>

      {vetements.length > 0 && analyses < vetements.length && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
          {vetements.length - analyses} vêtement(s) ne sont pas encore analysés. Les propositions
          seront plus pertinentes une fois l&apos;analyse terminée.{' '}
          <Link href="/" className="underline">
            Voir la garde-robe
          </Link>
        </p>
      )}

      <FormulaireSuggestion />

      {job && <SuiviSuggestion jobId={job} garderobe={vetements} />}
    </div>
  )
}
