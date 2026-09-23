import { creerVetement } from '@/lib/actions'
import { FormulaireVetement } from '@/components/FormulaireVetement'

export default async function PageNouveauVetement({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>
}) {
  const { url } = await searchParams

  // Vient d'un lien : on n'accepte qu'une URL http(s) bien formée.
  let urlInitiale: string | undefined
  if (url) {
    try {
      const cible = new URL(url)
      if (cible.protocol === 'http:' || cible.protocol === 'https:') urlInitiale = cible.toString()
    } catch {
      // URL illisible : on ouvre simplement le formulaire vide.
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Ajouter un vêtement</h1>
      <FormulaireVetement action={creerVetement} urlInitiale={urlInitiale} />
    </div>
  )
}
