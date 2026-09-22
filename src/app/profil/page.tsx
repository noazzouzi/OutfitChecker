import { obtenirProfil } from '@/lib/requetes'
import { FormulaireProfil } from '@/components/FormulaireProfil'

export const dynamic = 'force-dynamic'

export default async function PageProfil() {
  const profil = await obtenirProfil()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Profil morphologique</h1>
        <p className="mt-1 max-w-2xl text-sm text-texte-doux">
          Ces informations décrivent le mannequin dans les prompts de génération d&apos;image.
          Aucune photo de toi n&apos;est stockée.
        </p>
      </div>
      <FormulaireProfil profil={profil} />
    </div>
  )
}
