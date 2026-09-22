/**
 * Worker d'analyse IA.
 *
 * Process séparé du serveur Next, lancé par `npm run dev` via concurrently.
 * Il dépile `jobs_ia` un job à la fois et appelle le CLI Claude Code.
 *
 * Pourquoi un process séparé : un appel au CLI prend plusieurs secondes
 * (démarrage du processus + inférence). Le faire dans une requête HTTP
 * bloquerait l'interface à chaque ajout de vêtement.
 *
 * Pourquoi séquentiel : le quota d'abonnement se consomme d'autant plus vite
 * que les appels sont parallèles, et rien ici n'est urgent.
 */
import fs from 'node:fs'
import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { jobsIa, vetements } from '@/lib/db/schema'
import {
  prochainJob,
  type PayloadAnalyse,
  type PayloadOutfitCopy,
  type PayloadSuggestion,
  type ResultatSuggestion,
} from '@/lib/jobs'
import { cheminImage } from '@/lib/images.server'
import { ia, ErreurQuotaIA } from '@/lib/ai'

const INTERVALLE_MS = 2_000
const TENTATIVES_MAX = 3
/** Attente après un quota atteint. Les fenêtres d'usage se comptent en heures. */
const PAUSE_QUOTA_MS = 15 * 60 * 1000

/**
 * Erreur qu'une nouvelle tentative ne corrigera jamais : photo absente,
 * vêtement supprimé. Elle court-circuite le backoff — réessayer ne ferait que
 * consommer du quota pour rien, comme l'a montré la mise au point.
 */
class ErreurDefinitive extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ErreurDefinitive'
  }
}

let arretDemande = false

function journal(message: string, ...reste: unknown[]) {
  console.log(`[worker] ${message}`, ...reste)
}

const attendre = (ms: number) => new Promise((resoudre) => setTimeout(resoudre, ms))

/**
 * Un job resté « en cours » vient forcément d'un worker interrompu : aucun
 * autre worker ne tourne en parallèle. On le remet en attente au démarrage,
 * sinon il resterait bloqué indéfiniment.
 */
async function recupererJobsInterrompus() {
  const resultat = await db
    .update(jobsIa)
    .set({ statut: 'en_attente' })
    .where(eq(jobsIa.statut, 'en_cours'))
  const nombre = (resultat as { changes?: number }).changes ?? 0
  if (nombre > 0) journal(`${nombre} job(s) interrompu(s) remis en attente.`)
}

/** N'écrase une valeur existante que si le job le demande explicitement. */
function fusionner<T>(existant: T, propose: T, ecraser: boolean): T {
  if (ecraser) return propose
  const estVide =
    existant === null ||
    existant === undefined ||
    existant === '' ||
    (Array.isArray(existant) && existant.length === 0)
  return estVide ? propose : existant
}

async function traiterAnalyse(payload: PayloadAnalyse) {
  const lignes = await db
    .select()
    .from(vetements)
    .where(eq(vetements.id, payload.vetementId))
    .limit(1)
  const vetement = lignes[0]

  if (!vetement) throw new ErreurDefinitive('Vêtement introuvable (supprimé entre-temps ?).')
  if (!vetement.imageFichier) {
    throw new ErreurDefinitive("Ce vêtement n'a pas de photo à analyser.")
  }

  // Vérifié avant d'appeler le CLI : sans ce contrôle, le modèle est sollicité,
  // constate l'absence du fichier et répond en prose — un appel gâché.
  const chemin = cheminImage(vetement.imageFichier)
  if (!fs.existsSync(chemin)) {
    throw new ErreurDefinitive(`Fichier image introuvable sur le disque : ${vetement.imageFichier}`)
  }

  await db
    .update(vetements)
    .set({ statutAnalyse: 'en_cours' })
    .where(eq(vetements.id, vetement.id))

  const attributs = await ia.analyserVetement(chemin, {
    nom: vetement.nom,
    categorie: vetement.categorie,
    marque: vetement.marque,
    descriptionBoutique: vetement.descriptionBoutique,
  })

  const { ecraser } = payload
  await db
    .update(vetements)
    .set({
      sousCategorie: fusionner(vetement.sousCategorie, attributs.sousCategorie, ecraser),
      couleurPrincipale: fusionner(
        vetement.couleurPrincipale,
        attributs.couleurPrincipale,
        ecraser,
      ),
      couleurHex: fusionner(vetement.couleurHex, attributs.couleurHex, ecraser),
      couleursSecondaires: fusionner(
        vetement.couleursSecondaires,
        attributs.couleursSecondaires,
        ecraser,
      ),
      matiere: fusionner(vetement.matiere, attributs.matiere, ecraser),
      coupe: fusionner(vetement.coupe, attributs.coupe, ecraser),
      motif: fusionner(vetement.motif, attributs.motif, ecraser),
      styles: fusionner(vetement.styles, attributs.styles, ecraser),
      occasions: fusionner(vetement.occasions, attributs.occasions, ecraser),
      saisons: fusionner(vetement.saisons, attributs.saisons, ecraser),
      descriptionPrompt: fusionner(
        vetement.descriptionPrompt,
        attributs.descriptionPrompt,
        ecraser,
      ),
      attributsBruts: attributs.brut,
      statutAnalyse: 'ok',
    })
    .where(eq(vetements.id, vetement.id))

  return { vetementId: vetement.id, descriptionPrompt: attributs.descriptionPrompt }
}

async function traiterSuggestion(payload: PayloadSuggestion): Promise<ResultatSuggestion> {
  const garderobe = await garderobeResumee()
  if (garderobe.length < 2) {
    throw new ErreurDefinitive(
      'Il faut au moins deux vêtements dans la garde-robe pour composer une tenue.',
    )
  }

  const propositions = await ia.suggererOutfits(garderobe, payload)

  if (propositions.length === 0) {
    throw new Error("Le modèle n'a proposé aucune tenue exploitable.")
  }

  return { propositions }
}

/** Résumé de la garde-robe soumis au modèle, en texte et non en images. */
async function garderobeResumee() {
  const tous = await db.select().from(vetements)
  return tous.map((v) => ({
    id: v.id,
    nom: v.nom,
    categorie: v.categorie,
    sousCategorie: v.sousCategorie,
    couleurPrincipale: v.couleurPrincipale,
    matiere: v.matiere,
    motif: v.motif,
    styles: v.styles ?? [],
    occasions: v.occasions ?? [],
    saisons: v.saisons ?? [],
  }))
}

async function traiterOutfitCopy(payload: PayloadOutfitCopy) {
  const chemin = cheminImage(payload.referenceImageFichier)
  if (!fs.existsSync(chemin)) {
    throw new ErreurDefinitive("L'image de référence a disparu du disque.")
  }

  const garderobe = await garderobeResumee()
  if (garderobe.length < 2) {
    throw new ErreurDefinitive(
      'Il faut au moins deux vêtements dans la garde-robe pour reproduire une tenue.',
    )
  }

  const resultat = await ia.copierTenue(chemin, garderobe)
  if (resultat.propositions.length === 0) {
    throw new Error("Aucune combinaison exploitable n'a pu être formée.")
  }
  return resultat
}

async function traiterUnJob(): Promise<boolean> {
  const job = await prochainJob()
  if (!job) return false

  await db
    .update(jobsIa)
    .set({ statut: 'en_cours' })
    .where(eq(jobsIa.id, job.id))

  journal(`${job.type} démarré`)

  try {
    const resultat =
      job.type === 'analyse_vetement'
        ? await traiterAnalyse(job.payload as PayloadAnalyse)
        : job.type === 'suggestion_outfit'
          ? await traiterSuggestion(job.payload as PayloadSuggestion)
          : job.type === 'outfitcopy'
            ? await traiterOutfitCopy(job.payload as PayloadOutfitCopy)
            : (() => {
                throw new ErreurDefinitive(`Type de job inconnu : ${job.type}`)
              })()

    await db
      .update(jobsIa)
      .set({ statut: 'ok', resultat, erreur: null })
      .where(eq(jobsIa.id, job.id))
    journal(`✓ ${job.type}`)
    return true
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : String(erreur)

    // Seules les analyses portent un statut sur le vêtement.
    const vetementId =
      job.type === 'analyse_vetement' ? (job.payload as PayloadAnalyse).vetementId : null

    if (erreur instanceof ErreurQuotaIA) {
      // Ce n'est pas un échec : le travail reste à faire, plus tard.
      // Les tentatives ne sont pas incrémentées, sinon un quota prolongé
      // consommerait les trois essais sans qu'aucun appel n'ait abouti.
      await db
        .update(jobsIa)
        .set({
          statut: 'en_attente',
          disponibleA: Date.now() + PAUSE_QUOTA_MS,
          erreur: message,
        })
        .where(eq(jobsIa.id, job.id))
      if (vetementId) {
        await db
          .update(vetements)
          .set({ statutAnalyse: 'en_attente' })
          .where(eq(vetements.id, vetementId))
      }

      journal(`⏸ quota atteint, reprise dans ${PAUSE_QUOTA_MS / 60000} min`)
      return true
    }

    const definitive = erreur instanceof ErreurDefinitive
    const tentatives = definitive ? TENTATIVES_MAX : job.tentatives + 1
    const abandonne = definitive || tentatives >= TENTATIVES_MAX

    await db
      .update(jobsIa)
      .set({
        statut: abandonne ? 'echec' : 'en_attente',
        tentatives,
        erreur: message,
        // Backoff exponentiel : 5 s, puis 10 s.
        disponibleA: abandonne ? 0 : Date.now() + 5_000 * 2 ** (tentatives - 1),
      })
      .where(eq(jobsIa.id, job.id))

    if (abandonne && vetementId) {
      await db
        .update(vetements)
        .set({ statutAnalyse: 'echec' })
        .where(eq(vetements.id, vetementId))
    }

    journal(
      definitive
        ? `✗ abandon — ${message.slice(0, 200)}`
        : `✗ tentative ${tentatives}/${TENTATIVES_MAX} — ${message.slice(0, 200)}`,
    )
    return true
  }
}

/**
 * Supprime les tâches dont le vêtement n'existe plus.
 *
 * Le lien vers le vêtement vit dans du JSON, pas dans une clé étrangère : une
 * base créée avant que la suppression ne fasse le ménage garde des tâches en
 * échec que le bandeau compte sans fin. Ce passage au démarrage la répare.
 */
async function purgerJobsOrphelins() {
  const resultat = await db.delete(jobsIa).where(
    sql`${jobsIa.type} = 'analyse_vetement'
        and json_extract(${jobsIa.payload}, '$.vetementId') not in (select id from vetements)`,
  )
  const nombre = (resultat as { changes?: number }).changes ?? 0
  if (nombre > 0) journal(`${nombre} tâche(s) orpheline(s) supprimée(s).`)
}

async function boucle() {
  journal('démarré')
  await recupererJobsInterrompus()
  await purgerJobsOrphelins()

  while (!arretDemande) {
    let aTravaille = false
    try {
      aTravaille = await traiterUnJob()
    } catch (erreur) {
      // Une panne de la boucle elle-même (base verrouillée, disque plein)
      // ne doit pas tuer le worker.
      journal('erreur de boucle :', erreur)
    }
    if (!aTravaille) await attendre(INTERVALLE_MS)
  }

  journal('arrêté')
  process.exit(0)
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (arretDemande) process.exit(0)
    journal('arrêt demandé, fin du job en cours…')
    arretDemande = true
  })
}

void boucle()
