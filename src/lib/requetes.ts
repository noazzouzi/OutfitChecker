import 'server-only'

import { asc, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  outfitVetements,
  outfits,
  profil,
  vetements,
  type Outfit,
  type Profil,
  type Vetement,
} from '@/lib/db/schema'

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

export type OutfitAvecPieces = { outfit: Outfit; pieces: Vetement[] }

/**
 * Charge tous les outfits avec leurs pièces.
 *
 * Deux requêtes puis un regroupement en mémoire : à l'échelle d'une garde-robe
 * personnelle c'est instantané, et ça évite d'écrire une agrégation SQL.
 */
export async function listerOutfits(): Promise<OutfitAvecPieces[]> {
  const tous = await db.select().from(outfits).orderBy(desc(outfits.createdAt))
  if (tous.length === 0) return []

  const liens = await db
    .select({ outfitId: outfitVetements.outfitId, ordre: outfitVetements.ordre, vetement: vetements })
    .from(outfitVetements)
    .innerJoin(vetements, eq(outfitVetements.vetementId, vetements.id))
    .orderBy(asc(outfitVetements.ordre))

  return tous.map((outfit) => ({
    outfit,
    pieces: liens.filter((lien) => lien.outfitId === outfit.id).map((lien) => lien.vetement),
  }))
}

export async function obtenirOutfit(id: string): Promise<OutfitAvecPieces | null> {
  const lignes = await db.select().from(outfits).where(eq(outfits.id, id)).limit(1)
  const outfit = lignes[0]
  if (!outfit) return null

  const liens = await db
    .select({ ordre: outfitVetements.ordre, vetement: vetements })
    .from(outfitVetements)
    .innerJoin(vetements, eq(outfitVetements.vetementId, vetements.id))
    .where(eq(outfitVetements.outfitId, id))
    .orderBy(asc(outfitVetements.ordre))

  return { outfit, pieces: liens.map((lien) => lien.vetement) }
}
