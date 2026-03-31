import type { Plugin } from 'vite'
import * as fs from 'fs'
import * as path from 'path'
import { scanDocuments } from '../scripts/lib/scanDocuments'

export interface DocumentDiscoveryOptions {
  mindInsightDir: string
  techInsightDir: string
  aiApiUrl?: string
  aiModel?: string
  aiApiKey?: string
}

interface AIConfig {
  aiApiUrl: string
  aiModel: string
  aiApiKey: string
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

/** Read AI config from disk, falling back to vite.config.ts defaults */
function loadAIConfig(configPath: string, defaults: AIConfig): AIConfig {
  try {
    if (fs.existsSync(configPath)) {
      const saved = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      return { ...defaults, ...saved }
    }
  } catch {}
  // First run: write defaults to disk
  fs.writeFileSync(configPath, JSON.stringify(defaults, null, 2), 'utf-8')
  return { ...defaults }
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

      // AI config: persisted to .ai-config.json, editable from any client
      const aiConfigPath = path.resolve(process.cwd(), '.ai-config.json')
      const defaultConfig: AIConfig = {
        aiApiUrl: options.aiApiUrl || 'http://127.0.0.1:7001/v1',
        aiModel: options.aiModel || 'Qwen/Qwen3.5-27B-4bit',
        aiApiKey: options.aiApiKey || '',
      }
      let aiConfig = loadAIConfig(aiConfigPath, defaultConfig)

      // GET /api/ai/config — return config (apiKey masked)
      // POST /api/ai/config — save config from client
      server.middlewares.use('/api/ai/config', (req, res) => {
        res.setHeader('Content-Type', 'application/json')

        if (req.method === 'POST') {
          const chunks: Buffer[] = []
          req.on('data', (chunk: Buffer) => chunks.push(chunk))
          req.on('end', () => {
            try {
              const update = JSON.parse(Buffer.concat(chunks).toString())
              // Only allow updating known fields
              if (typeof update.aiApiUrl === 'string') aiConfig.aiApiUrl = update.aiApiUrl
              if (typeof update.aiModel === 'string') aiConfig.aiModel = update.aiModel
              // apiKey: use new value if non-empty, keep existing if client sends empty string
              // (client sends empty when user didn't change the masked field)
              if (typeof update.aiApiKey === 'string') aiConfig.aiApiKey = update.aiApiKey
              fs.writeFileSync(aiConfigPath, JSON.stringify(aiConfig, null, 2), 'utf-8')
              res.end(JSON.stringify({ ok: true, aiApiUrl: aiConfig.aiApiUrl, aiModel: aiConfig.aiModel, aiApiKey: '●●●●●●●●' }))
            } catch {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Invalid JSON' }))
            }
          })
          return
        }

        // GET
        res.end(JSON.stringify({
          aiApiUrl: aiConfig.aiApiUrl,
          aiModel: aiConfig.aiModel,
          aiApiKey: aiConfig.aiApiKey || '',
        }))
      })

      // Helper: resolve target URL from current config
      const resolveTargetUrl = () => {
        const base = aiConfig.aiApiUrl.replace(/\/+$/, '')
        return base.endsWith('/chat/completions') ? base : `${base}/chat/completions`
      }

      // AI proxy: forward chat/completions requests to the configured AI model
      server.middlewares.use('/api/ai/chat/completions', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method Not Allowed')
          return
        }

        // Read request body and inject server-side model
        const chunks: Buffer[] = []
        for await (const chunk of req) chunks.push(chunk as Buffer)
        const rawBody = Buffer.concat(chunks)

        let body = rawBody
        try {
          const parsed = JSON.parse(rawBody.toString())
          parsed.model = aiConfig.aiModel
          body = Buffer.from(JSON.stringify(parsed))
        } catch {}

        const proxyHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
        }
        if (aiConfig.aiApiKey) {
          proxyHeaders['Authorization'] = `Bearer ${aiConfig.aiApiKey}`
        } else if (req.headers['authorization']) {
          proxyHeaders['Authorization'] = req.headers['authorization'] as string
        }

        try {
          const aiRes = await fetch(resolveTargetUrl(), {
            method: 'POST',
            headers: proxyHeaders,
            body,
          })

          res.writeHead(aiRes.status, {
            'Content-Type': aiRes.headers.get('content-type') || 'text/event-stream',
            'Cache-Control': 'no-cache',
          })

          if (aiRes.body) {
            const reader = aiRes.body.getReader()
            try {
              while (true) {
                const { done, value } = await reader.read()
                if (done) break
                res.write(value)
              }
            } finally {
              reader.releaseLock()
            }
          }

          res.end()
        } catch (e: any) {
          if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'application/json' })
          }
          res.end(JSON.stringify({ error: `AI proxy error: ${e.message}` }))
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
