import type { Plugin } from 'vite'
import * as fs from 'fs'
import * as path from 'path'
import { scanDocuments } from '../scripts/lib/scanDocuments'

export interface DocumentDiscoveryOptions {
  mindInsightDir: string
  techInsightDir: string
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  return MIME_TYPES[ext] || 'application/octet-stream'
}

function sendFile(res: import('http').ServerResponse, absPath: string): void {
  if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
    res.statusCode = 404
    res.end('Not Found')
    return
  }
  const content = fs.readFileSync(absPath)
  res.setHeader('Content-Type', getMimeType(absPath))
  res.setHeader('Content-Length', content.length)
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.end(content)
}

export function documentDiscovery(options: DocumentDiscoveryOptions): Plugin {
  return {
    name: 'document-discovery',
    configureServer(server) {
      // API endpoint: return document manifest
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

      // Static file serving for document HTML and their assets (images, CSS, etc.)
      // Bypasses Vite's @fs transform pipeline for much faster LAN access
      server.middlewares.use('/dev-docs', (req, res) => {
        const urlPath = req.url?.split('?')[0] || ''
        // urlPath: /dev-docs/mindinsight/category/file.html or /dev-docs/techinsight/category/sub/file.html

        const segments = urlPath.split('/').filter(Boolean)
        if (segments.length < 2) {
          res.statusCode = 400
          res.end('Bad Request')
          return
        }

        const source = segments[0] // mindinsight or techinsight
        const relativePath = segments.slice(1).join(path.sep)

        const baseDir = source === 'mindinsight' ? options.mindInsightDir : options.techInsightDir
        const absPath = path.resolve(baseDir, relativePath)

        // Security: ensure the resolved path is within the allowed directory
        if (!absPath.startsWith(baseDir)) {
          res.statusCode = 403
          res.end('Forbidden')
          return
        }

        sendFile(res, absPath)
      })
    },
  }
}
