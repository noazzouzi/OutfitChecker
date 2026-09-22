import { spawn } from 'node:child_process'
import {
  extraireJson,
  schemaAnalyseVetement,
  schemaOutfitCopy,
  schemaSuggestions,
} from './schemas'
import { promptAnalyseVetement, promptOutfitCopy, promptSuggestionOutfits } from './prompts'
import {
  ErreurQuotaIA,
  type AttributsVetement,
  type ContexteVetement,
  type ContrainteOutfit,
  type FournisseurIA,
  type OutfitSuggere,
  type PieceResumee,
  type ResultatOutfitCopy,
} from './types'

/** Binaire du CLI. Surchargeable si `claude` n'est pas dans le PATH du worker. */
const BINAIRE = process.env.OUTFITCHECKER_CLAUDE_BIN ?? 'claude'

/** Laisse le CLI utiliser le modèle configuré par l'utilisateur, sauf override. */
const MODELE = process.env.OUTFITCHECKER_MODELE ?? null

const DELAI_MAX_MS = Number(process.env.OUTFITCHECKER_TIMEOUT_MS ?? 180_000)

/**
 * Motifs signalant un quota d'abonnement atteint plutôt qu'une vraie erreur.
 * Le worker doit alors patienter, pas marquer le job en échec.
 */
const MOTIFS_QUOTA = [
  /usage limit/i,
  /rate limit/i,
  /quota/i,
  /limit reached/i,
  /limit will reset/i,
  /too many requests/i,
  /\b429\b/,
]

function ressembleAUnQuota(texte: string): boolean {
  return MOTIFS_QUOTA.some((motif) => motif.test(texte))
}

type SortieCli = {
  type?: string
  subtype?: string
  is_error?: boolean
  result?: string
  api_error_status?: number | null
  permission_denials?: unknown[]
}

/**
 * Exécute `claude -p --output-format json` et renvoie le texte de la réponse.
 *
 * Le prompt passe par stdin plutôt que par argv : il fait plusieurs kilo-octets
 * et contient des guillemets, des accolades et des accents.
 */
function executerCli(prompt: string, dossierTravail: string): Promise<string> {
  const arguments_ = [
    '-p',
    '--output-format',
    'json',
    // Seul outil nécessaire : lire le fichier image. Rien d'autre n'est autorisé.
    '--allowedTools',
    'Read',
  ]
  if (MODELE) arguments_.push('--model', MODELE)

  return new Promise((resoudre, rejeter) => {
    const processus = spawn(BINAIRE, arguments_, {
      cwd: dossierTravail,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let sortie = ''
    let erreurs = ''
    let expire = false

    const minuteur = setTimeout(() => {
      expire = true
      processus.kill('SIGKILL')
    }, DELAI_MAX_MS)

    processus.stdout.on('data', (morceau) => (sortie += morceau))
    processus.stderr.on('data', (morceau) => (erreurs += morceau))

    processus.on('error', (erreur) => {
      clearTimeout(minuteur)
      rejeter(
        new Error(
          `Impossible de lancer « ${BINAIRE} » : ${erreur.message}. ` +
            `Vérifie que le CLI Claude Code est installé et connecté.`,
        ),
      )
    })

    processus.on('close', (code) => {
      clearTimeout(minuteur)

      if (expire) {
        return rejeter(new Error(`Le CLI n'a pas répondu en ${DELAI_MAX_MS / 1000} s.`))
      }

      const trace = `${sortie}\n${erreurs}`.trim()

      if (code !== 0) {
        return rejeter(
          ressembleAUnQuota(trace)
            ? new ErreurQuotaIA(`Quota d'abonnement atteint : ${trace.slice(0, 300)}`)
            : new Error(`Le CLI a échoué (code ${code}) : ${trace.slice(0, 500)}`),
        )
      }

      let donnees: SortieCli
      try {
        donnees = JSON.parse(sortie)
      } catch {
        return rejeter(new Error(`Sortie du CLI illisible : ${sortie.slice(0, 300)}`))
      }

      const texte = donnees.result ?? ''

      if (donnees.is_error || donnees.subtype !== 'success') {
        const details = `${donnees.subtype ?? ''} ${texte}`.trim()
        return rejeter(
          ressembleAUnQuota(details) || donnees.api_error_status === 429
            ? new ErreurQuotaIA(`Quota d'abonnement atteint : ${details.slice(0, 300)}`)
            : new Error(`Le CLI a renvoyé une erreur : ${details.slice(0, 500)}`),
        )
      }

      if (donnees.permission_denials && donnees.permission_denials.length > 0) {
        return rejeter(
          new Error(
            "Le CLI n'a pas eu le droit de lire l'image. " +
              'Vérifie que le worker tourne depuis la racine du projet.',
          ),
        )
      }

      resoudre(texte)
    })

    processus.stdin.write(prompt)
    processus.stdin.end()
  })
}

export class AdaptateurCli implements FournisseurIA {
  constructor(private readonly dossierTravail: string = process.cwd()) {}

  async analyserVetement(
    cheminImage: string,
    contexte: ContexteVetement,
  ): Promise<AttributsVetement> {
    const texte = await executerCli(
      promptAnalyseVetement(cheminImage, contexte),
      this.dossierTravail,
    )

    const brut = extraireJson(texte)
    const analyse = schemaAnalyseVetement.safeParse(brut)

    if (!analyse.success) {
      const details = analyse.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' ; ')
      throw new Error(`Analyse invalide — ${details}`)
    }

    return { ...analyse.data, brut }
  }

  async suggererOutfits(
    garderobe: PieceResumee[],
    contrainte: ContrainteOutfit,
  ): Promise<OutfitSuggere[]> {
    if (garderobe.length === 0) return []

    const texte = await executerCli(
      promptSuggestionOutfits(garderobe, contrainte),
      this.dossierTravail,
    )

    const analyse = schemaSuggestions.safeParse(extraireJson(texte))
    if (!analyse.success) {
      throw new Error(`Suggestions invalides — ${analyse.error.issues[0]?.message ?? ''}`)
    }

    return (
      analyse.data.propositions
        .map((proposition) => ({
          nom: proposition.nom,
          justification: proposition.justification,
          // Les numéros sont ceux de l'inventaire envoyé au modèle. Un numéro
          // hors bornes ou répété est écarté : le modèle n'a pas à être cru
          // sur parole, et une tenue amputée vaut mieux qu'un plantage.
          vetementIds: Array.from(new Set(proposition.pieces))
            .filter((numero) => numero >= 1 && numero <= garderobe.length)
            .map((numero) => garderobe[numero - 1].id),
        }))
        // Une « tenue » d'une seule pièce n'en est pas une.
        .filter((proposition) => proposition.vetementIds.length >= 2)
    )
  }

  async copierTenue(
    cheminImage: string,
    garderobe: PieceResumee[],
  ): Promise<ResultatOutfitCopy> {
    const texte = await executerCli(
      promptOutfitCopy(cheminImage, garderobe),
      this.dossierTravail,
    )

    const analyse = schemaOutfitCopy.safeParse(extraireJson(texte))
    if (!analyse.success) {
      throw new Error(`Analyse de référence invalide — ${analyse.error.issues[0]?.message ?? ''}`)
    }

    return {
      reference: analyse.data.reference,
      propositions: analyse.data.propositions
        .map((proposition) => ({
          nom: proposition.nom,
          justification: proposition.justification,
          proximite: proposition.proximite,
          // Mêmes précautions que pour les suggestions : un numéro hors
          // bornes ou répété est écarté plutôt que cru sur parole.
          vetementIds: Array.from(new Set(proposition.pieces))
            .filter((numero) => numero >= 1 && numero <= garderobe.length)
            .map((numero) => garderobe[numero - 1].id),
        }))
        .filter((proposition) => proposition.vetementIds.length >= 2)
        .sort((a, b) => b.proximite - a.proximite),
    }
  }
}
