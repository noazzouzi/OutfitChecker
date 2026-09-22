CREATE TABLE `jobs_ia` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`type` text NOT NULL,
	`payload` text,
	`statut` text DEFAULT 'en_attente' NOT NULL,
	`tentatives` integer DEFAULT 0 NOT NULL,
	`erreur` text,
	`resultat` text
);
--> statement-breakpoint
CREATE TABLE `outfit_vetements` (
	`outfit_id` text NOT NULL,
	`vetement_id` text NOT NULL,
	`role` text,
	`ordre` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`outfit_id`, `vetement_id`),
	FOREIGN KEY (`outfit_id`) REFERENCES `outfits`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`vetement_id`) REFERENCES `vetements`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `outfits` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`nom` text NOT NULL,
	`occasion` text,
	`saison` text,
	`note` text,
	`source` text DEFAULT 'manuel' NOT NULL,
	`prompts` text,
	`image_rendu_fichier` text,
	`reference_image_fichier` text
);
--> statement-breakpoint
CREATE TABLE `profil` (
	`id` integer PRIMARY KEY NOT NULL,
	`taille_cm` integer,
	`poids_kg` integer,
	`morphotype` text,
	`genre_presentation` text,
	`teint` text,
	`cheveux` text,
	`pointure` integer,
	`notes_style` text
);
--> statement-breakpoint
CREATE TABLE `vetements` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`nom` text NOT NULL,
	`categorie` text NOT NULL,
	`marque` text,
	`taille` text,
	`prix` real,
	`url_source` text,
	`boutique` text,
	`sous_categorie` text,
	`couleur_principale` text,
	`couleur_hex` text,
	`couleurs_secondaires` text,
	`matiere` text,
	`coupe` text,
	`motif` text,
	`styles` text,
	`occasions` text,
	`saisons` text,
	`description_prompt` text,
	`attributs_bruts` text,
	`image_fichier` text,
	`image_detouree_fichier` text,
	`statut_analyse` text DEFAULT 'en_attente' NOT NULL
);
