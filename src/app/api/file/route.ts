import { etatFile } from '@/lib/jobs'

/** Interrogé par le bandeau de suivi pour savoir où en est l'analyse. */
export async function GET() {
  return Response.json(await etatFile(), {
    headers: { 'Cache-Control': 'no-store' },
  })
}
