import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  /**
   * better-sqlite3 est un module natif (.node) : il ne doit jamais être
   * bundlé par Turbopack, sinon le binaire n'est pas résolu à l'exécution.
   */
  serverExternalPackages: ['better-sqlite3'],
}

export default nextConfig
