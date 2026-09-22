import { randomUUID } from 'node:crypto'
import { and, asc, eq, lte, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { jobsIa, vetements } from '@/lib/db/schema'

export type PayloadAnalyse = {
  vetementId: string
  /** true = remplacer aussi les champs déjà renseignés. */
  ecraser: boolean
}

/**
 * Met un vêtement en file d'analyse.
 *
 * Idempotent : si un job est déjà en attente ou en cours pour ce vêtement, on
 * n'en crée pas un second — sinon enregistrer deux fois de suite consommerait
 * deux fois le quota pour le même résultat.
 */
export async function enfilerAnalyse(vetementId: string, ecraser = false): Promise<void> {
  const existants = await db
    .select({ id: jobsIa.id, payload: jobsIa.payload })
    .from(jobsIa)
    .where(and(eq(jobsIa.type, 'analyse_vetement'), sql`${jobsIa.statut} in ('en_attente','en_cours')`))

  const dejaEnFile = existants.some(
    (job) => (job.payload as PayloadAnalyse | null)?.vetementId === vetementId,
  )
  if (dejaEnFile) return

  await db.insert(jobsIa).values({
    id: randomUUID(),
    createdAt: Date.now(),
    type: 'analyse_vetement',
    payload: { vetementId, ecraser } satisfies PayloadAnalyse,
    statut: 'en_attente',
    disponibleA: 0,
  })

  await db
    .update(vetements)
    .set({ statutAnalyse: 'en_attente' })
    .where(eq(vetements.id, vetementId))
}

/** Prochain job exécutable : en attente et dont le délai de reprise est écoulé. */
export async function prochainJob() {
  const lignes = await db
    .select()
    .from(jobsIa)
    .where(and(eq(jobsIa.statut, 'en_attente'), lte(jobsIa.disponibleA, Date.now())))
    .orderBy(asc(jobsIa.createdAt))
    .limit(1)
  return lignes[0] ?? null
}

export type EtatFile = {
  enAttente: number
  enCours: number
  echec: number
  /** Vrai quand tous les jobs restants attendent une reprise différée. */
  enPause: boolean
  /** Horodatage de la reprise la plus proche, si la file est en pause. */
  prochaineRepriseA: number | null
  /** Dernier message d'erreur observé, pour expliquer une pause. */
  dernierMessage: string | null
}

export async function etatFile(): Promise<EtatFile> {
  const jobs = await db
    .select({
      statut: jobsIa.statut,
      disponibleA: jobsIa.disponibleA,
      erreur: jobsIa.erreur,
      createdAt: jobsIa.createdAt,
    })
    .from(jobsIa)
    .where(sql`${jobsIa.statut} in ('en_attente','en_cours','echec')`)

  const enAttente = jobs.filter((j) => j.statut === 'en_attente')
  const differes = enAttente.filter((j) => j.disponibleA > Date.now())

  const dernier = [...jobs]
    .filter((j) => j.erreur)
    .sort((a, b) => b.createdAt - a.createdAt)[0]

  // Une pause n'a de sens à afficher que si *tous* les jobs restants attendent.
  const enPause = enAttente.length > 0 && differes.length === enAttente.length

  return {
    enAttente: enAttente.length,
    enCours: jobs.filter((j) => j.statut === 'en_cours').length,
    echec: jobs.filter((j) => j.statut === 'echec').length,
    enPause,
    prochaineRepriseA: enPause ? Math.min(...differes.map((j) => j.disponibleA)) : null,
    dernierMessage: dernier?.erreur ?? null,
  }
}
