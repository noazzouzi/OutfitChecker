import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = {
  title: 'OutfitChecker',
  description: 'Garde-robe personnelle et composition de tenues',
}

/**
 * Pas de police Google : l'app doit fonctionner sans réseau, et `next/font/google`
 * télécharge les fichiers au build. On s'appuie sur la pile système.
 */
export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <header className="border-b border-bordure bg-surface">
          {/* Sur téléphone, le nom et le libellé du bouton raccourcissent : à
              pleine longueur, la barre débordait de 65 px sur un écran de 390. */}
          <nav className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 whitespace-nowrap sm:gap-6">
            <Link href="/" className="text-sm font-semibold tracking-tight">
              <span className="sm:hidden">OC</span>
              <span className="hidden sm:inline">OutfitChecker</span>
            </Link>
            <div className="flex-1" />
            <Link href="/" className="text-sm text-texte-doux hover:text-texte">
              Garde-robe
            </Link>
            <Link href="/outfits" className="text-sm text-texte-doux hover:text-texte">
              Tenues
            </Link>
            <Link href="/profil" className="text-sm text-texte-doux hover:text-texte">
              Profil
            </Link>
            <Link href="/vetements/nouveau" className="bouton" aria-label="Ajouter un vêtement">
              <span aria-hidden className="sm:hidden">+</span>
              <span className="hidden sm:inline">Ajouter</span>
            </Link>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
      </body>
    </html>
  )
}
