import { obtenirJob } from '@/lib/jobs'

/** Interrogé par la page de suggestion, le temps que le worker réponde. */
export async function GET(_requete: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const job = await obtenirJob(id)
  if (!job) return new Response('Job introuvable', { status: 404 })

  return Response.json(
    { statut: job.statut, resultat: job.resultat, erreur: job.erreur },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
