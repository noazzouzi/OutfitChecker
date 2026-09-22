import { listerVetements } from '@/lib/requetes'
import { CompositeurOutfit } from '@/components/CompositeurOutfit'
import { MOTIF_NOM_FICHIER } from '@/lib/images'

export const dynamic = 'force-dynamic'

export default async function PageNouvelOutfit({
  searchParams,
}: {
  searchParams: Promise<{
    pieces?: string
    nom?: string
    source?: string
    reference?: string
  }>
}) {
  const { pieces, nom, source, reference } = await searchParams
  const vetements = await listerVetements()

  // Une proposition de l'IA arrive par l'URL : on ne fait confiance qu'aux
  // identifiants réellement présents dans la garde-robe.
  const connus = new Set(vetements.map((v) => v.id))
  const preselection = (pieces?.split(',') ?? []).filter((id) => connus.has(id))

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Composer une tenue</h1>
      <CompositeurOutfit
        vetements={vetements}
        preselection={preselection}
        nomPropose={nom ?? ''}
        source={
          source === 'suggestion_ia' || source === 'outfitcopy' ? source : 'manuel'
        }
        referenceImageFichier={reference && MOTIF_NOM_FICHIER.test(reference) ? reference : null}
      />
    </div>
  )
}
