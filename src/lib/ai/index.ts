import { AdaptateurCli } from './cli'
import type { FournisseurIA } from './types'

/**
 * Point d'entrée unique vers l'IA.
 *
 * Pour basculer sur une clé API plus tard : écrire `AdaptateurApi` implémentant
 * `FournisseurIA` et changer cette seule ligne.
 */
export const ia: FournisseurIA = new AdaptateurCli()

export * from './types'
