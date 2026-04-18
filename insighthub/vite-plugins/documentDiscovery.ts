import type { Plugin } from 'vite'
import * as fs from 'fs'
import * as path from 'path'
import { scanDocuments } from '../scripts/lib/scanDocuments'

export interface DocumentDiscoveryOptions {
  mindInsightDir: string
  techInsightDir: string
  leetcodeInsightDir?: string
  aiApiUrl?: string
  aiModel?: string
  aiApiKey?: string
}

interface AppConfig {
  aiApiUrl: string
  aiModel: string
  aiApiKey: string
  quizDifficulty: string
  quizQuestionCount: number
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
  res.setHeader('Cache-Control', 'no-cache')
  res.end(content)
}

/** Read app config from disk, falling back to vite.config.ts defaults */
function loadAppConfig(configPath: string, defaults: AppConfig): AppConfig {
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
          const manifest = scanDocuments(options.mindInsightDir, options.techInsightDir, options.leetcodeInsightDir)
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(manifest))
        } catch (e) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: String(e) }))
        }
      })

      // App config: persisted to .insighthub-config.json, editable from any client
      // Migrate from old .ai-config.json if it exists
      const configPath = path.resolve(process.cwd(), '.insighthub-config.json')
      const legacyConfigPath = path.resolve(process.cwd(), '.ai-config.json')
      if (fs.existsSync(legacyConfigPath) && !fs.existsSync(configPath)) {
        fs.renameSync(legacyConfigPath, configPath)
      }
      const defaultConfig: AppConfig = {
        aiApiUrl: options.aiApiUrl || 'http://127.0.0.1:7001/v1',
        aiModel: options.aiModel || 'Qwen/Qwen3.5-27B-4bit',
        aiApiKey: options.aiApiKey || '',
        quizDifficulty: 'medium',
        quizQuestionCount: 5,
      }
      let appConfig = loadAppConfig(configPath, defaultConfig)

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
              if (typeof update.aiApiUrl === 'string') appConfig.aiApiUrl = update.aiApiUrl
              if (typeof update.aiModel === 'string') appConfig.aiModel = update.aiModel
              if (typeof update.aiApiKey === 'string') appConfig.aiApiKey = update.aiApiKey
              if (typeof update.quizDifficulty === 'string') appConfig.quizDifficulty = update.quizDifficulty
              if (typeof update.quizQuestionCount === 'number') appConfig.quizQuestionCount = update.quizQuestionCount
              fs.writeFileSync(configPath, JSON.stringify(appConfig, null, 2), 'utf-8')
              res.end(JSON.stringify({
                ok: true,
                aiApiUrl: appConfig.aiApiUrl,
                aiModel: appConfig.aiModel,
                aiApiKey: '●●●●●●●●',
                quizDifficulty: appConfig.quizDifficulty,
                quizQuestionCount: appConfig.quizQuestionCount,
              }))
            } catch {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Invalid JSON' }))
            }
          })
          return
        }

        // GET
        res.end(JSON.stringify({
          aiApiUrl: appConfig.aiApiUrl,
          aiModel: appConfig.aiModel,
          aiApiKey: appConfig.aiApiKey || '',
          quizDifficulty: appConfig.quizDifficulty,
          quizQuestionCount: appConfig.quizQuestionCount,
        }))
      })

      // Helper: resolve target URL from current config
      const resolveTargetUrl = () => {
        const base = appConfig.aiApiUrl.replace(/\/+$/, '')
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
          parsed.model = appConfig.aiModel
          body = Buffer.from(JSON.stringify(parsed))
        } catch {}

        const proxyHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
        }
        if (appConfig.aiApiKey) {
          proxyHeaders['Authorization'] = `Bearer ${appConfig.aiApiKey}`
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

      // Quiz persistence: shared across all LAN clients via .insighthub-quizzes.json
      const quizzesPath = path.resolve(process.cwd(), '.insighthub-quizzes.json')

      function loadQuizzesFile(): Record<string, any> {
        try {
          if (fs.existsSync(quizzesPath)) {
            return JSON.parse(fs.readFileSync(quizzesPath, 'utf-8'))
          }
        } catch {}
        return {}
      }

      function saveQuizzesFile(quizzes: Record<string, any>): void {
        fs.writeFileSync(quizzesPath, JSON.stringify(quizzes, null, 2), 'utf-8')
      }

      server.middlewares.use('/api/quizzes', (req, res) => {
        res.setHeader('Content-Type', 'application/json')

        if (req.method === 'GET') {
          res.end(JSON.stringify(loadQuizzesFile()))
          return
        }

        if (req.method === 'POST') {
          const chunks: Buffer[] = []
          req.on('data', (chunk: Buffer) => chunks.push(chunk))
          req.on('end', () => {
            try {
              const quiz: any = JSON.parse(Buffer.concat(chunks).toString())
              if (!quiz || !quiz.documentId) {
                res.statusCode = 400
                res.end(JSON.stringify({ error: 'Missing documentId' }))
                return
              }
              const quizzes = loadQuizzesFile()
              quizzes[quiz.documentId] = quiz
              saveQuizzesFile(quizzes)
              res.end(JSON.stringify({ ok: true }))
            } catch {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Invalid JSON' }))
            }
          })
          return
        }

        if (req.method === 'DELETE') {
          const chunks: Buffer[] = []
          req.on('data', (chunk: Buffer) => chunks.push(chunk))
          req.on('end', () => {
            try {
              const { documentId } = JSON.parse(Buffer.concat(chunks).toString())
              if (!documentId) {
                res.statusCode = 400
                res.end(JSON.stringify({ error: 'Missing documentId' }))
                return
              }
              const quizzes = loadQuizzesFile()
              delete quizzes[documentId]
              saveQuizzesFile(quizzes)
              res.end(JSON.stringify({ ok: true }))
            } catch {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Invalid JSON' }))
            }
          })
          return
        }

        res.statusCode = 405
        res.end('Method Not Allowed')
      })

      // Read meta persistence: shared across all LAN clients via .insighthub-read-meta.json
      const readMetaPath = path.resolve(process.cwd(), '.insighthub-read-meta.json')

      function loadReadMetaFile(): Record<string, any> {
        try {
          if (fs.existsSync(readMetaPath)) {
            return JSON.parse(fs.readFileSync(readMetaPath, 'utf-8'))
          }
        } catch {}
        return {}
      }

      function saveReadMetaFile(meta: Record<string, any>): void {
        fs.writeFileSync(readMetaPath, JSON.stringify(meta, null, 2), 'utf-8')
      }

      server.middlewares.use('/api/read-meta', (req, res) => {
        res.setHeader('Content-Type', 'application/json')

        if (req.method === 'GET') {
          res.end(JSON.stringify(loadReadMetaFile()))
          return
        }

        if (req.method === 'POST') {
          const chunks: Buffer[] = []
          req.on('data', (chunk: Buffer) => chunks.push(chunk))
          req.on('end', () => {
            try {
              const update: any = JSON.parse(Buffer.concat(chunks).toString())
              if (!update || !update.id) {
                res.statusCode = 400
                res.end(JSON.stringify({ error: 'Missing id' }))
                return
              }
              const meta = loadReadMetaFile()
              meta[update.id] = update
              saveReadMetaFile(meta)
              res.end(JSON.stringify({ ok: true }))
            } catch {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Invalid JSON' }))
            }
          })
          return
        }

        if (req.method === 'DELETE') {
          const id = new URL(req.url || '/', 'http://localhost').searchParams.get('id')
          if (!id) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'Missing id' }))
            return
          }
          const meta = loadReadMetaFile()
          delete meta[id]
          saveReadMetaFile(meta)
          res.end(JSON.stringify({ ok: true }))
          return
        }

        res.statusCode = 405
        res.end('Method Not Allowed')
      })

      // Read history persistence: shared across all LAN clients via .insighthub-read-history.json
      const readHistoryPath = path.resolve(process.cwd(), '.insighthub-read-history.json')

      function loadReadHistoryFile(): any[] {
        try {
          if (fs.existsSync(readHistoryPath)) {
            return JSON.parse(fs.readFileSync(readHistoryPath, 'utf-8'))
          }
        } catch {}
        return []
      }

      function saveReadHistoryFile(history: any[]): void {
        fs.writeFileSync(readHistoryPath, JSON.stringify(history.slice(0, 365), null, 2), 'utf-8')
      }

      server.middlewares.use('/api/read-history', (req, res) => {
        res.setHeader('Content-Type', 'application/json')

        if (req.method === 'GET') {
          res.end(JSON.stringify(loadReadHistoryFile()))
          return
        }

        if (req.method === 'POST') {
          const chunks: Buffer[] = []
          req.on('data', (chunk: Buffer) => chunks.push(chunk))
          req.on('end', () => {
            try {
              const entry: any = JSON.parse(Buffer.concat(chunks).toString())
              if (!entry || !entry.documentId) {
                res.statusCode = 400
                res.end(JSON.stringify({ error: 'Missing documentId' }))
                return
              }
              const history = loadReadHistoryFile()
              // Deduplicate and prepend
              const filtered = history.filter((h: any) => h.documentId !== entry.documentId)
              filtered.unshift(entry)
              saveReadHistoryFile(filtered)
              res.end(JSON.stringify({ ok: true }))
            } catch {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Invalid JSON' }))
            }
          })
          return
        }

        if (req.method === 'DELETE') {
          const documentId = new URL(req.url || '/', 'http://localhost').searchParams.get('documentId')
          if (!documentId) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'Missing documentId' }))
            return
          }
          const history = loadReadHistoryFile()
          const filtered = history.filter((h: any) => h.documentId !== documentId)
          saveReadHistoryFile(filtered)
          res.end(JSON.stringify({ ok: true }))
          return
        }

        res.statusCode = 405
        res.end('Method Not Allowed')
      })

      // Quiz history persistence: shared across all LAN clients via .insighthub-quiz-history.json
      const quizHistoryPath = path.resolve(process.cwd(), '.insighthub-quiz-history.json')

      function loadQuizHistoryFile(): any[] {
        try {
          if (fs.existsSync(quizHistoryPath)) {
            return JSON.parse(fs.readFileSync(quizHistoryPath, 'utf-8'))
          }
        } catch {}
        return []
      }

      function saveQuizHistoryFile(history: any[]): void {
        fs.writeFileSync(quizHistoryPath, JSON.stringify(history.slice(0, 100), null, 2), 'utf-8')
      }

      server.middlewares.use('/api/quiz-history', (req, res) => {
        res.setHeader('Content-Type', 'application/json')

        if (req.method === 'GET') {
          res.end(JSON.stringify(loadQuizHistoryFile()))
          return
        }

        if (req.method === 'POST') {
          const chunks: Buffer[] = []
          req.on('data', (chunk: Buffer) => chunks.push(chunk))
          req.on('end', () => {
            try {
              const attempt: any = JSON.parse(Buffer.concat(chunks).toString())
              if (!attempt) {
                res.statusCode = 400
                res.end(JSON.stringify({ error: 'Missing attempt data' }))
                return
              }
              const history = loadQuizHistoryFile()
              history.unshift(attempt)
              saveQuizHistoryFile(history)
              res.end(JSON.stringify({ ok: true }))
            } catch {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Invalid JSON' }))
            }
          })
          return
        }

        res.statusCode = 405
        res.end('Method Not Allowed')
      })

      // Tags persistence: shared across all LAN clients via .insighthub-tags.json
      const tagsPath = path.resolve(process.cwd(), '.insighthub-tags.json')

      function loadTagsFile(): any[] {
        try {
          if (fs.existsSync(tagsPath)) {
            return JSON.parse(fs.readFileSync(tagsPath, 'utf-8'))
          }
        } catch {}
        return []
      }

      function saveTagsFile(tags: any[]): void {
        fs.writeFileSync(tagsPath, JSON.stringify(tags, null, 2), 'utf-8')
      }

      server.middlewares.use('/api/tags', (req, res) => {
        res.setHeader('Content-Type', 'application/json')

        if (req.method === 'GET') {
          res.end(JSON.stringify(loadTagsFile()))
          return
        }

        if (req.method === 'POST') {
          const chunks: Buffer[] = []
          req.on('data', (chunk: Buffer) => chunks.push(chunk))
          req.on('end', () => {
            try {
              const tags: any[] = JSON.parse(Buffer.concat(chunks).toString())
              if (!Array.isArray(tags)) {
                res.statusCode = 400
                res.end(JSON.stringify({ error: 'Expected array' }))
                return
              }
              saveTagsFile(tags)
              res.end(JSON.stringify({ ok: true }))
            } catch {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Invalid JSON' }))
            }
          })
          return
        }

        res.statusCode = 405
        res.end('Method Not Allowed')
      })

      // Annotations persistence: shared across all LAN clients via .insighthub-annotations.json
      const annotationsPath = path.resolve(process.cwd(), '.insighthub-annotations.json')

      function loadAnnotationsFile(): any[] {
        try {
          if (fs.existsSync(annotationsPath)) {
            return JSON.parse(fs.readFileSync(annotationsPath, 'utf-8'))
          }
        } catch {}
        return []
      }

      function saveAnnotationsFile(annotations: any[]): void {
        fs.writeFileSync(annotationsPath, JSON.stringify(annotations, null, 2), 'utf-8')
      }

      server.middlewares.use('/api/annotations', (req, res) => {
        res.setHeader('Content-Type', 'application/json')

        if (req.method === 'GET') {
          res.end(JSON.stringify(loadAnnotationsFile()))
          return
        }

        if (req.method === 'POST') {
          const chunks: Buffer[] = []
          req.on('data', (chunk: Buffer) => chunks.push(chunk))
          req.on('end', () => {
            try {
              const annotations: any[] = JSON.parse(Buffer.concat(chunks).toString())
              if (!Array.isArray(annotations)) {
                res.statusCode = 400
                res.end(JSON.stringify({ error: 'Expected array' }))
                return
              }
              saveAnnotationsFile(annotations)
              res.end(JSON.stringify({ ok: true }))
            } catch {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Invalid JSON' }))
            }
          })
          return
        }

        res.statusCode = 405
        res.end('Method Not Allowed')
      })

      // Concept cards persistence: shared across all LAN clients via .insighthub-concept-cards.json
      const conceptCardsPath = path.resolve(process.cwd(), '.insighthub-concept-cards.json')

      server.middlewares.use('/api/concept-cards', (req, res) => {
        res.setHeader('Content-Type', 'application/json')

        if (req.method === 'GET') {
          try {
            if (fs.existsSync(conceptCardsPath)) {
              res.end(fs.readFileSync(conceptCardsPath, 'utf-8'))
            } else {
              res.end('[]')
            }
          } catch {
            res.end('[]')
          }
          return
        }

        if (req.method === 'POST') {
          const chunks: Buffer[] = []
          req.on('data', (chunk: Buffer) => chunks.push(chunk))
          req.on('end', () => {
            try {
              const cards: any[] = JSON.parse(Buffer.concat(chunks).toString())
              if (!Array.isArray(cards)) {
                res.statusCode = 400
                res.end(JSON.stringify({ error: 'Expected array' }))
                return
              }
              fs.writeFileSync(conceptCardsPath, JSON.stringify(cards, null, 2), 'utf-8')
              res.end(JSON.stringify({ ok: true }))
            } catch {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Invalid JSON' }))
            }
          })
          return
        }

        res.statusCode = 405
        res.end('Method Not Allowed')
      })

      // Imported documents: written directly to TechInsight/<category>/, legacy metadata in .insighthub-imported-docs.json
      const importedDocsPath = path.resolve(process.cwd(), '.insighthub-imported-docs.json')
      const IMPORT_DOC_SIZE_LIMIT = 5 * 1024 * 1024 // 5MB

      interface ImportedDocRecord {
        id: string
        fileName: string
        source: 'mindinsight' | 'techinsight'
        category: string
        importedAt: number
        encrypted?: boolean
        title?: string
        wordCount?: number
        language?: string
      }

      function loadImportedDocsFile(): ImportedDocRecord[] {
        try {
          if (fs.existsSync(importedDocsPath)) {
            return JSON.parse(fs.readFileSync(importedDocsPath, 'utf-8'))
          }
        } catch {}
        return []
      }

      function saveImportedDocsFile(docs: ImportedDocRecord[]): void {
        fs.writeFileSync(importedDocsPath, JSON.stringify(docs, null, 2), 'utf-8')
      }

      // Legacy: resolve old imported-doc HTML from .insighthub-imports/
      const legacyImportsDir = path.resolve(process.cwd(), '.insighthub-imports')
      function legacyImportedDocHtmlPath(docId: string): string {
        return path.join(legacyImportsDir, `${docId}.html`)
      }

      // GET /api/imported-documents — list imported docs metadata
      // POST /api/imported-documents — save new imported doc directly to TechInsight
      // DELETE /api/imported-documents?id=xxx — delete imported doc
      server.middlewares.use('/api/imported-documents', (req, res) => {
        res.setHeader('Content-Type', 'application/json')

        if (req.method === 'GET') {
          res.end(JSON.stringify(loadImportedDocsFile()))
          return
        }

        if (req.method === 'POST') {
          const chunks: Buffer[] = []
          req.on('data', (chunk: Buffer) => chunks.push(chunk))
          req.on('end', () => {
            try {
              const body: any = JSON.parse(Buffer.concat(chunks).toString())
              if (!body.htmlContent || !body.fileName || !body.category) {
                res.statusCode = 400
                res.end(JSON.stringify({ error: 'Missing required fields' }))
                return
              }
              const contentSize = Buffer.byteLength(body.htmlContent, 'utf-8')
              if (contentSize > IMPORT_DOC_SIZE_LIMIT) {
                res.statusCode = 400
                res.end(JSON.stringify({ error: `File too large (${Math.round(contentSize / 1024)}KB), max 5MB` }))
                return
              }

              // Generate ID matching scanDocuments format: ti-<category>-<name>
              const nameWithoutExt = body.fileName.replace(/\.html$/, '')
              const id = `ti-${body.category}-${nameWithoutExt}`
              const destDir = path.join(options.techInsightDir, body.category)
              const destPath = path.join(destDir, body.fileName)

              // Ensure category directory exists
              fs.mkdirSync(destDir, { recursive: true })
              // Write HTML directly to TechInsight
              fs.writeFileSync(destPath, body.htmlContent, 'utf-8')

              res.end(JSON.stringify({ ok: true, id }))
            } catch {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Invalid JSON' }))
            }
          })
          return
        }

        if (req.method === 'DELETE') {
          const id = new URL(req.url || '/', 'http://localhost').searchParams.get('id')
          if (!id) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'Missing id' }))
            return
          }
          const docs = loadImportedDocsFile()
          const target = docs.find(d => d.id === id)
          const filtered = docs.filter(d => d.id !== id)
          saveImportedDocsFile(filtered)
          // Remove the HTML file (try TechInsight dir first, then legacy imports dir)
          if (target) {
            const techPath = path.join(options.techInsightDir, target.category, target.fileName)
            if (fs.existsSync(techPath)) {
              fs.unlinkSync(techPath)
            }
          }
          const legacyFile = legacyImportedDocHtmlPath(id)
          if (fs.existsSync(legacyFile)) {
            fs.unlinkSync(legacyFile)
          }
          res.end(JSON.stringify({ ok: true }))
          return
        }

        res.statusCode = 405
        res.end('Method Not Allowed')
      })

      // GET /api/imported-doc/:docId — serve legacy imported HTML from .insighthub-imports/
      server.middlewares.use('/api/imported-doc', (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405
          res.end('Method Not Allowed')
          return
        }
        const urlPath = req.url?.split('?')[0] || ''
        const docId = urlPath.startsWith('/') ? urlPath.slice(1) : urlPath
        if (!docId) {
          res.statusCode = 400
          res.end('Missing docId')
          return
        }
        const htmlFile = legacyImportedDocHtmlPath(docId)
        if (!fs.existsSync(htmlFile) || !fs.statSync(htmlFile).isFile()) {
          res.statusCode = 404
          res.end('Not Found')
          return
        }
        sendFile(res, htmlFile)
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

        const source = segments[0] // mindinsight, techinsight, or leetcodeinsight
        const relativePath = segments.slice(1).join(path.sep)

        const SOURCE_DIR_MAP: Record<string, string> = {
          mindinsight: options.mindInsightDir,
          techinsight: options.techInsightDir,
          leetcodeinsight: options.leetcodeInsightDir || '',
        }
        const baseDir = SOURCE_DIR_MAP[source] || options.techInsightDir
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
