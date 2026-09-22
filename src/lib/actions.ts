'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { eq, inArray } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/lib/db'
import { outfitVetements, outfits, profil, vetements } from '@/lib/db/schema'
import { obtenirOutfit, obtenirVetement } from '@/lib/requetes'
import { enfilerAnalyse, enfilerSuggestion, supprimerJobsDuVetement } from '@/lib/jobs'
import { lireFicheProduit, type FicheProduit } from '@/lib/boutique'
import {
  enregistrerFichierEnvoye,
  supprimerImage,
  telechargerImage,
} from '@/lib/images.server'
import { CATEGORIES, OCCASIONS, SAISONS, SOURCES_OUTFIT, STYLES } from '@/lib/constantes'
import { ordonnerPieces } from '@/lib/prompts-image'

export type EtatFormulaire = { erreur: string } | null

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

/** Un champ texte vide vaut « non renseigné », pas chaîne vide. */
const texteOptionnel = z
  .string()
  .trim()
  .transform((v) => (v.length === 0 ? null : v))
  .nullable()

const schemaVetement = z.object({
  nom: z.string().trim().min(1, 'Le nom est obligatoire.'),
  categorie: z.enum(CATEGORIES),
  marque: texteOptionnel,
  taille: texteOptionnel,
  prix: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? null : Number.parseFloat(v.replace(',', '.'))))
    .refine((v) => v === null || Number.isFinite(v), 'Prix invalide.')
    .nullable(),
  urlSource: texteOptionnel,
  boutique: texteOptionnel,
  sousCategorie: texteOptionnel,
  couleurPrincipale: texteOptionnel,
  matiere: texteOptionnel,
  coupe: texteOptionnel,
  motif: texteOptionnel,
  descriptionPrompt: texteOptionnel,
  descriptionBoutique: texteOptionnel,
  saisons: z.array(z.enum(SAISONS)),
  styles: z.array(z.enum(STYLES)),
  occasions: z.array(z.enum(OCCASIONS)),
})

function lireChamps(formData: FormData) {
  const lire = (cle: string) => (formData.get(cle) as string | null) ?? ''
  return schemaVetement.safeParse({
    nom: lire('nom'),
    categorie: lire('categorie'),
    marque: lire('marque'),
    taille: lire('taille'),
    prix: lire('prix'),
    urlSource: lire('urlSource'),
    boutique: lire('boutique'),
    sousCategorie: lire('sousCategorie'),
    couleurPrincipale: lire('couleurPrincipale'),
    matiere: lire('matiere'),
    coupe: lire('coupe'),
    motif: lire('motif'),
    descriptionPrompt: lire('descriptionPrompt'),
    descriptionBoutique: lire('descriptionBoutique'),
    saisons: formData.getAll('saisons'),
    styles: formData.getAll('styles'),
    occasions: formData.getAll('occasions'),
  })
}

function messageErreur(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message : 'Une erreur inattendue est survenue.'
}

/* ------------------------------------------------------------------ */
/* Import depuis une URL de boutique                                   */
/* ------------------------------------------------------------------ */

export type ResultatImport =
  | { ok: true; fiche: FicheProduit; imageFichier: string | null }
  | { ok: false; erreur: string }

/**
 * Lit la fiche produit et télécharge son image immédiatement, pour pouvoir
 * l'afficher en aperçu avant que l'utilisateur valide le formulaire.
 */
export async function importerDepuisUrl(url: string): Promise<ResultatImport> {
  try {
    const fiche = await lireFicheProduit(url)

    let imageFichier: string | null = null
    if (fiche.imageUrl) {
      try {
        imageFichier = await telechargerImage(fiche.imageUrl)
      } catch {
        // L'image peut être protégée alors que la page ne l'est pas :
        // on garde les métadonnées et l'utilisateur ajoutera une photo.
      }
    }

    return { ok: true, fiche, imageFichier }
  } catch (erreur) {
    return { ok: false, erreur: messageErreur(erreur) }
  }
}

/* ------------------------------------------------------------------ */
/* Vêtements                                                           */
/* ------------------------------------------------------------------ */

export async function creerVetement(
  _precedent: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const analyse = lireChamps(formData)
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? 'Formulaire invalide.' }
  }

  let id: string
  try {
    // Deux origines possibles : une photo envoyée, ou une image déjà
    // téléchargée lors de l'import URL.
    let imageFichier = (formData.get('imageFichier') as string | null) || null
    const fichier = formData.get('fichier')
    if (fichier instanceof File && fichier.size > 0) {
      imageFichier = await enregistrerFichierEnvoye(fichier)
    }

    id = randomUUID()
    await db.insert(vetements).values({
      id,
      createdAt: Date.now(),
      ...analyse.data,
      imageFichier,
      statutAnalyse: 'en_attente',
    })

    // Sans photo, il n'y a rien à analyser : inutile de consommer du quota.
    if (imageFichier) await enfilerAnalyse(id)
  } catch (erreur) {
    return { erreur: messageErreur(erreur) }
  }

  revalidatePath('/')
  redirect(`/vetements/${id}`)
}

export async function modifierVetement(
  _precedent: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const id = formData.get('id') as string
  if (!id) return { erreur: 'Vêtement introuvable.' }

  const analyse = lireChamps(formData)
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? 'Formulaire invalide.' }
  }

  try {
    const fichier = formData.get('fichier')
    const valeurs: Record<string, unknown> = { ...analyse.data }

    let photoRemplacee = false
    if (fichier instanceof File && fichier.size > 0) {
      const existant = await obtenirVetement(id)
      valeurs.imageFichier = await enregistrerFichierEnvoye(fichier)
      // Le détourage porte sur l'ancienne photo : il ne vaut plus rien.
      valeurs.imageDetoureeFichier = null
      await supprimerImage(existant?.imageFichier)
      await supprimerImage(existant?.imageDetoureeFichier)
      photoRemplacee = true
    }

    await db.update(vetements).set(valeurs).where(eq(vetements.id, id))

    // Nouvelle photo = analyse périmée. On ne réécrase pas les champs que
    // l'utilisateur vient de saisir : seuls les champs vides seront remplis.
    if (photoRemplacee) await enfilerAnalyse(id)
  } catch (erreur) {
    return { erreur: messageErreur(erreur) }
  }

  revalidatePath('/')
  redirect(`/vetements/${id}`)
}

export async function supprimerVetement(id: string): Promise<void> {
  const existant = await obtenirVetement(id)
  await db.delete(vetements).where(eq(vetements.id, id))
  // Les tâches d'analyse ne sont pas liées par clé étrangère : à nettoyer à la main.
  await supprimerJobsDuVetement(id)
  await supprimerImage(existant?.imageFichier)
  await supprimerImage(existant?.imageDetoureeFichier)

  revalidatePath('/')
  redirect('/')
}

/** Reçoit le PNG détouré produit par le navigateur. */
export async function enregistrerDetourage(formData: FormData): Promise<void> {
  const id = formData.get('id') as string
  const fichier = formData.get('fichier')
  if (!id || !(fichier instanceof File) || fichier.size === 0) return

  const existant = await obtenirVetement(id)
  const nomFichier = await enregistrerFichierEnvoye(fichier)

  await db
    .update(vetements)
    .set({ imageDetoureeFichier: nomFichier })
    .where(eq(vetements.id, id))

  await supprimerImage(existant?.imageDetoureeFichier)

  revalidatePath('/')
  revalidatePath(`/vetements/${id}`)
}

/**
 * Relance l'analyse d'un vêtement.
 *
 * `ecraser = false` ne remplit que les champs vides — c'est le cas courant,
 * après un échec ou pour compléter une fiche. `ecraser = true` refait l'analyse
 * complète et remplace les valeurs existantes, y compris saisies à la main.
 */
export async function relancerAnalyse(id: string, ecraser = false): Promise<void> {
  const vetement = await obtenirVetement(id)
  if (!vetement?.imageFichier) return

  await enfilerAnalyse(id, ecraser)

  revalidatePath('/')
  revalidatePath(`/vetements/${id}`)
}

/* ------------------------------------------------------------------ */
/* Profil                                                              */
/* ------------------------------------------------------------------ */

const entierOptionnel = z
  .string()
  .trim()
  .transform((v) => (v.length === 0 ? null : Number.parseInt(v, 10)))
  .refine((v) => v === null || Number.isFinite(v), 'Valeur numérique invalide.')
  .nullable()

const schemaProfil = z.object({
  tailleCm: entierOptionnel,
  poidsKg: entierOptionnel,
  pointure: entierOptionnel,
  morphotype: texteOptionnel,
  genrePresentation: texteOptionnel,
  teint: texteOptionnel,
  cheveux: texteOptionnel,
  notesStyle: texteOptionnel,
})

export async function enregistrerProfil(
  _precedent: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const lire = (cle: string) => (formData.get(cle) as string | null) ?? ''
  const analyse = schemaProfil.safeParse({
    tailleCm: lire('tailleCm'),
    poidsKg: lire('poidsKg'),
    pointure: lire('pointure'),
    morphotype: lire('morphotype'),
    genrePresentation: lire('genrePresentation'),
    teint: lire('teint'),
    cheveux: lire('cheveux'),
    notesStyle: lire('notesStyle'),
  })

  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? 'Formulaire invalide.' }
  }

  try {
    await db
      .insert(profil)
      .values({ id: 1, ...analyse.data })
      .onConflictDoUpdate({ target: profil.id, set: analyse.data })
  } catch (erreur) {
    return { erreur: messageErreur(erreur) }
  }

  revalidatePath('/profil')
  return null
}

/* ------------------------------------------------------------------ */
/* Outfits                                                             */
/* ------------------------------------------------------------------ */

const schemaOutfit = z.object({
  nom: z.string().trim().min(1, "Donne un nom à la tenue."),
  occasion: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? null : v))
    .nullable(),
  saison: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? null : v))
    .nullable(),
  note: texteOptionnel,
  source: z.enum(SOURCES_OUTFIT).catch('manuel'),
})

export async function creerOutfit(
  _precedent: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const lire = (cle: string) => (formData.get(cle) as string | null) ?? ''
  const analyse = schemaOutfit.safeParse({
    nom: lire('nom'),
    occasion: lire('occasion'),
    saison: lire('saison'),
    note: lire('note'),
    source: lire('source'),
  })
  if (!analyse.success) {
    return { erreur: analyse.error.issues[0]?.message ?? 'Formulaire invalide.' }
  }

  const ids = formData.getAll('vetementIds').filter((v): v is string => typeof v === 'string')
  if (ids.length < 2) return { erreur: 'Sélectionne au moins deux pièces.' }

  let id: string
  try {
    const pieces = await db.select().from(vetements).where(inArray(vetements.id, ids))
    if (pieces.length < 2) return { erreur: 'Les pièces sélectionnées sont introuvables.' }

    id = randomUUID()
    await db.insert(outfits).values({
      id,
      createdAt: Date.now(),
      ...analyse.data,
      occasion: analyse.data.occasion as never,
      saison: analyse.data.saison as never,
    })

    // L'ordre est calculé, pas subi : il détermine à la fois la numérotation
    // du pack d'images et les références « image N » du prompt instructionnel.
    // Les deux doivent coïncider, sinon le générateur mélange les pièces.
    await db.insert(outfitVetements).values(
      ordonnerPieces(pieces).map((piece, index) => ({
        outfitId: id,
        vetementId: piece.id,
        role: piece.categorie,
        ordre: index,
      })),
    )
  } catch (erreur) {
    return { erreur: messageErreur(erreur) }
  }

  revalidatePath('/outfits')
  redirect(`/outfits/${id}`)
}

export async function supprimerOutfit(id: string): Promise<void> {
  const existant = await obtenirOutfit(id)
  await db.delete(outfits).where(eq(outfits.id, id))
  await supprimerImage(existant?.outfit.imageRenduFichier)

  revalidatePath('/outfits')
  redirect('/outfits')
}

/** Reçoit l'image produite par le générateur externe. */
export async function enregistrerRendu(formData: FormData): Promise<void> {
  const id = formData.get('id') as string
  const fichier = formData.get('fichier')
  if (!id || !(fichier instanceof File) || fichier.size === 0) return

  const existant = await obtenirOutfit(id)
  const nomFichier = await enregistrerFichierEnvoye(fichier)

  await db.update(outfits).set({ imageRenduFichier: nomFichier }).where(eq(outfits.id, id))
  await supprimerImage(existant?.outfit.imageRenduFichier)

  revalidatePath('/outfits')
  revalidatePath(`/outfits/${id}`)
}

/**
 * Mémorise une version retouchée d'un prompt. Tant qu'aucune retouche n'est
 * enregistrée, le prompt est recalculé depuis les pièces — il reste donc
 * toujours cohérent avec la composition.
 */
export async function enregistrerPrompt(
  id: string,
  cible: string,
  texte: string,
): Promise<void> {
  const existant = await obtenirOutfit(id)
  if (!existant) return

  const prompts = { ...(existant.outfit.prompts ?? {}) }
  if (texte.trim().length === 0) delete prompts[cible]
  else prompts[cible] = texte

  await db.update(outfits).set({ prompts }).where(eq(outfits.id, id))
  revalidatePath(`/outfits/${id}`)
}

/* ------------------------------------------------------------------ */
/* Suggestions IA                                                      */
/* ------------------------------------------------------------------ */

export async function demanderSuggestions(
  _precedent: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const lire = (cle: string) => ((formData.get(cle) as string | null) ?? '').trim()

  let jobId: string
  try {
    jobId = await enfilerSuggestion({
      texte: lire('texte') || null,
      occasion: lire('occasion') || null,
      saison: lire('saison') || null,
    })
  } catch (erreur) {
    return { erreur: messageErreur(erreur) }
  }

  redirect(`/outfits/suggerer?job=${jobId}`)
}
