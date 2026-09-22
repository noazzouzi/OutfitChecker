import 'server-only'

import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema'

export const DOSSIER_DONNEES = path.join(process.cwd(), 'data')
export const DOSSIER_IMAGES = path.join(DOSSIER_DONNEES, 'images')
const FICHIER_BASE = path.join(DOSSIER_DONNEES, 'app.db')

function ouvrir() {
  fs.mkdirSync(DOSSIER_IMAGES, { recursive: true })

  const sqlite = new Database(FICHIER_BASE)

  /**
   * WAL est indispensable, pas une optimisation : au lot 2 le worker IA
   * écrira dans cette base en même temps que le serveur Next. Sans WAL,
   * les deux processus se bloquent mutuellement (`database is locked`).
   */
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  // Laisse 5 s à une écriture concurrente avant d'abandonner.
  sqlite.pragma('busy_timeout = 5000')

  const db = drizzle(sqlite, { schema })

  // Les migrations sont appliquées au démarrage : rien à lancer à la main.
  migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') })

  return db
}

/**
 * En développement, Next recharge les modules à chaque modification. Sans ce
 * cache global, chaque rechargement rouvrirait une connexion à la base.
 */
const global_ = globalThis as unknown as { __db?: ReturnType<typeof ouvrir> }

export const db = global_.__db ?? ouvrir()
if (process.env.NODE_ENV !== 'production') global_.__db = db

export { schema }
