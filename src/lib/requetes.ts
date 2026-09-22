import 'server-only'

import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { profil, vetements, type Profil, type Vetement } from '@/lib/db/schema'

/**
 * Charge toute la garde-robe d'un coup. À l'échelle d'une garde-robe
 * personnelle, le filtrage se fait ensuite côté client : c'est instantané et
 * ça évite d'écrire des requêtes SQL sur des colonnes JSON.
 */
export async function listerVetements(): Promise<Vetement[]> {
  return db.select().from(vetements).orderBy(desc(vetements.createdAt))
}

export async function obtenirVetement(id: string): Promise<Vetement | null> {
  const lignes = await db.select().from(vetements).where(eq(vetements.id, id)).limit(1)
  return lignes[0] ?? null
}

/** Le profil est un singleton : toujours `id = 1`. */
export async function obtenirProfil(): Promise<Profil | null> {
  const lignes = await db.select().from(profil).where(eq(profil.id, 1)).limit(1)
  return lignes[0] ?? null
}
