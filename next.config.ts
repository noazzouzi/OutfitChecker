import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  /**
   * better-sqlite3 est un module natif (.node) : il ne doit jamais être
   * bundlé par Turbopack, sinon le binaire n'est pas résolu à l'exécution.
   */
  serverExternalPackages: [
    'better-sqlite3',
    // playwright-core lance un binaire et lit le disque : il doit rester
    // externe au bundle serveur.
    'playwright-core',
  ],
}

export default nextConfig
