import { creerVetement } from '@/lib/actions'
import { FormulaireVetement } from '@/components/FormulaireVetement'

export default function PageNouveauVetement() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Ajouter un vêtement</h1>
      <FormulaireVetement action={creerVetement} />
    </div>
  )
}
