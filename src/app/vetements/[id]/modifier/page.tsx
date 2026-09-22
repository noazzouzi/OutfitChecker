import { notFound } from 'next/navigation'
import { obtenirVetement } from '@/lib/requetes'
import { modifierVetement } from '@/lib/actions'
import { FormulaireVetement } from '@/components/FormulaireVetement'

export const dynamic = 'force-dynamic'

export default async function PageModifierVetement({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const vetement = await obtenirVetement(id)
  if (!vetement) notFound()

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Modifier « {vetement.nom} »</h1>
      <FormulaireVetement action={modifierVetement} vetement={vetement} />
    </div>
  )
}
