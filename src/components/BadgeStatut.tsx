import type { StatutAnalyse } from '@/lib/constantes'

const APPARENCE: Record<StatutAnalyse, { libelle: string; classe: string }> = {
  en_attente: {
    libelle: 'Analyse en attente',
    classe: 'border-amber-300 text-amber-700 dark:text-amber-400',
  },
  en_cours: {
    libelle: 'Analyse en cours',
    classe: 'border-blue-300 text-blue-700 dark:text-blue-400 animate-pulse',
  },
  ok: { libelle: 'Analysé', classe: 'border-emerald-300 text-emerald-700 dark:text-emerald-400' },
  echec: { libelle: 'Analyse échouée', classe: 'border-red-300 text-red-700 dark:text-red-400' },
}

/**
 * Sans photo, il n'y a rien à analyser : aucune tâche n'est créée et le statut
 * resterait « en attente » indéfiniment. Mieux vaut dire pourquoi.
 */
const SANS_PHOTO = {
  libelle: 'Pas de photo à analyser',
  classe: 'border-bordure text-texte-doux',
}

export function BadgeStatut({
  statut,
  sansPhoto = false,
}: {
  statut: StatutAnalyse
  sansPhoto?: boolean
}) {
  const { libelle, classe } = sansPhoto ? SANS_PHOTO : APPARENCE[statut]
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${classe}`}>
      {libelle}
    </span>
  )
}

/** Pastille compacte pour les vignettes de la grille. */
export function PastilleStatut({
  statut,
  sansPhoto = false,
}: {
  statut: StatutAnalyse
  sansPhoto?: boolean
}) {
  if (sansPhoto) {
    return (
      <span
        title={SANS_PHOTO.libelle}
        aria-label={SANS_PHOTO.libelle}
        className="block h-2 w-2 shrink-0 rounded-full bg-stone-400"
      />
    )
  }
  if (statut === 'ok') return null

  const couleurs: Record<Exclude<StatutAnalyse, 'ok'>, string> = {
    en_attente: 'bg-amber-400',
    en_cours: 'bg-blue-400 animate-pulse',
    echec: 'bg-red-500',
  }

  return (
    <span
      title={APPARENCE[statut].libelle}
      aria-label={APPARENCE[statut].libelle}
      className={`block h-2 w-2 shrink-0 rounded-full ${couleurs[statut]}`}
    />
  )
}
