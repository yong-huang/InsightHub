import type { Plugin } from 'vite'
import { scanDocuments } from '../scripts/lib/scanDocuments'

export interface DocumentDiscoveryOptions {
  mindInsightDir: string
  techInsightDir: string
}

export function documentDiscovery(options: DocumentDiscoveryOptions): Plugin {
  return {
    name: 'document-discovery',
    configureServer(server) {
      server.middlewares.use('/api/documents', (_req, res) => {
        try {
          const manifest = scanDocuments(options.mindInsightDir, options.techInsightDir)
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(manifest))
        } catch (e) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: String(e) }))
        }
      })
    },
  }
}
