import type { Plugin } from 'vite'
import * as fs from 'fs'
import * as path from 'path'
import { execSync, exec } from 'child_process'
import * as os from 'os'
import type { WorkspaceEntry } from '../src/types'
import { scanWorkspaces } from '../scripts/lib/scanDocuments'

export interface DocumentDiscoveryOptions {
  aiApiUrl?: string
  aiModel?: string
  aiApiKey?: string
  workspacesPath?: string
}

interface AIProfile {
  id: string
  name: string
  aiApiUrl: string
  aiModel: string
  aiApiKey: string
}

interface TTSConfig {
  ttsApiUrl: string
  ttsModel: string
  ttsVoice: string
}

interface AppConfig {
  profiles: AIProfile[]
  activeProfileId: string
  // Legacy fields kept for backward compat
  aiApiUrl: string
  aiModel: string
  aiApiKey: string
  quizDifficulty: string
  quizQuestionCount: number
  tts: TTSConfig
}

function generateProfileId(): string {
  return 'p-' + Math.random().toString(36).slice(2, 10)
}

function maskApiKey(key: string): string {
  if (!key) return ''
  if (key.length <= 8) return '●●●●●●●●'
  return key.slice(0, 3) + '●●●●' + key.slice(-3)
}

function getActiveProfile(cfg: AppConfig): AIProfile | undefined {
  return cfg.profiles.find(p => p.id === cfg.activeProfileId)
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

/** Migrate legacy flat config to profiles format */
function migrateToProfiles(saved: any, defaults: AppConfig): AppConfig {
  const merged = { ...defaults, ...saved }
  // Already has profiles — ensure activeProfileId is valid
  if (saved.profiles && Array.isArray(saved.profiles) && saved.profiles.length > 0) {
    if (!saved.profiles.find((p: AIProfile) => p.id === merged.activeProfileId)) {
      merged.activeProfileId = merged.profiles[0].id
    }
    return merged
  }
  // Legacy format: create first profile from top-level fields
  const url = saved.aiApiUrl || defaults.aiApiUrl
  const model = saved.aiModel || defaults.aiModel
  const key = saved.aiApiKey ?? defaults.aiApiKey
  const profile: AIProfile = {
    id: generateProfileId(),
    name: 'Default Config',
    aiApiUrl: url,
    aiModel: model,
    aiApiKey: key,
  }
  merged.profiles = [profile]
  merged.activeProfileId = profile.id
  return merged
}

/** Read app config from disk, falling back to vite.config.ts defaults */
function loadAppConfig(configPath: string, defaults: AppConfig): AppConfig {
  try {
    if (fs.existsSync(configPath)) {
      const saved = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      const cfg = migrateToProfiles(saved, defaults)
      // Sanitize: clear any masked API keys that got saved as real values
      for (const p of cfg.profiles) {
        if (p.aiApiKey && p.aiApiKey.includes('●')) {
          p.aiApiKey = ''
        }
      }
      if (cfg.aiApiKey && cfg.aiApiKey.includes('●')) {
        cfg.aiApiKey = ''
      }
      // Persist (migrated or sanitized)
      fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf-8')
      return cfg
    }
  } catch {}
  // First run: create default profile and write to disk
  const profile: AIProfile = {
    id: generateProfileId(),
    name: 'Default Config',
    aiApiUrl: defaults.aiApiUrl,
    aiModel: defaults.aiModel,
    aiApiKey: defaults.aiApiKey,
  }
  const cfg: AppConfig = {
    ...defaults,
    profiles: [profile],
    activeProfileId: profile.id,
  }
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf-8')
  return cfg
}

export function documentDiscovery(options: DocumentDiscoveryOptions): Plugin {
  return {
    name: 'document-discovery',
    configureServer(server) {
      // Base directory: resolve workspace paths relative to the insighthub project root
      const BASE_DIR = path.resolve(__dirname, '..')

      // Unified data directory for all persistent JSON files
      const DATA_DIR = path.resolve(BASE_DIR, 'data')
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

      // Migrate legacy data files from insighthub/ root to data/ directory
      const LEGACY_FILES = [
        '.insighthub-config.json',
        '.ai-config.json',
        '.insighthub-quizzes.json',
        '.insighthub-read-meta.json',
        '.insighthub-read-history.json',
        '.insighthub-quiz-history.json',
        '.insighthub-tags.json',
        '.insighthub-annotations.json',
        '.insighthub-concept-cards.json',
        '.insighthub-imported-docs.json',
        '.insighthub-client-storage.json',
        '.insighthub-workspaces.json',
      ]
      for (const file of LEGACY_FILES) {
        const legacyPath = path.resolve(BASE_DIR, file)
        const newPath = path.resolve(DATA_DIR, file)
        if (fs.existsSync(legacyPath) && !fs.existsSync(newPath)) {
          fs.renameSync(legacyPath, newPath)
        }
      }

      // Workspace config: read from data/.insighthub-workspaces.json
      const workspacesConfigPath = path.resolve(DATA_DIR, options.workspacesPath || '.insighthub-workspaces.json')

      // Map from workspace ID to directory path (resolved relative to project root)
      function getWorkspaceDirs(): Record<string, string> {
        const dirs: Record<string, string> = {}
        // Start from config file, falling back to defaults
        const workspaces = loadWorkspaces()
        for (const ws of workspaces) {
          if (ws.path) {
            dirs[ws.id] = path.isAbsolute(ws.path)
              ? ws.path
              : path.resolve(BASE_DIR, ws.path)
          }
        }
        return dirs
      }

      function loadWorkspaces(): WorkspaceEntry[] {
        try {
          if (fs.existsSync(workspacesConfigPath)) {
            const wsConfig: WorkspaceEntry[] = JSON.parse(fs.readFileSync(workspacesConfigPath, 'utf-8'))
            if (Array.isArray(wsConfig) && wsConfig.length > 0) return wsConfig
          }
        } catch {}
        return []
      }

      // API endpoint: return document manifest (cached 1s to avoid redundant fs scans)
      let manifestCache: { data: string; ts: number } | null = null
      const MANIFEST_TTL = 1000 // 1 second

      server.middlewares.use('/api/documents', (_req, res) => {
        try {
          const now = Date.now()
          if (manifestCache && now - manifestCache.ts < MANIFEST_TTL) {
            res.setHeader('Content-Type', 'application/json')
            res.end(manifestCache.data)
            return
          }
          const workspaces = loadWorkspaces()
          const manifest = scanWorkspaces(workspaces, BASE_DIR)
          const data = JSON.stringify(manifest)
          manifestCache = { data, ts: now }
          res.setHeader('Content-Type', 'application/json')
          res.end(data)
        } catch (e) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: String(e) }))
        }
      })

      // Workspace config endpoint: read/write .insighthub-workspaces.json
      server.middlewares.use('/api/workspaces', (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        if (req.method === 'GET') {
          try {
            if (fs.existsSync(workspacesConfigPath)) {
              res.end(fs.readFileSync(workspacesConfigPath, 'utf-8'))
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
              const config: WorkspaceEntry[] = JSON.parse(Buffer.concat(chunks).toString())
              if (!Array.isArray(config)) {
                res.statusCode = 400
                res.end(JSON.stringify({ error: 'Expected array' }))
                return
              }
              // Normalize paths to relative (from project root) before saving
              const normalized = config.map(ws => {
                if (ws.path && path.isAbsolute(ws.path)) {
                  try {
                    ws.path = path.relative(BASE_DIR, ws.path)
                  } catch {}
                }
                return ws
              })
              fs.writeFileSync(workspacesConfigPath, JSON.stringify(normalized, null, 2), 'utf-8')
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

      // Directory browsing endpoint for workspace path selection
      server.middlewares.use('/api/browse-directories', (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405
          res.end('Method Not Allowed')
          return
        }
        res.setHeader('Content-Type', 'application/json')
        const url = new URL(req.url || '/', 'http://localhost')
        const dirPath = url.searchParams.get('path')
        if (!dirPath) {
          res.statusCode = 400
          res.end(JSON.stringify({ error: 'Missing path parameter' }))
          return
        }
        const resolved = path.resolve(dirPath)
        // Security: must be an absolute path
        if (!path.isAbsolute(resolved)) {
          res.statusCode = 400
          res.end(JSON.stringify({ error: 'Path must be absolute' }))
          return
        }
        try {
          if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
            res.end(JSON.stringify({ currentPath: resolved, entries: [] }))
            return
          }
          const entries = fs.readdirSync(resolved, { withFileTypes: true })
            .filter(entry => !entry.name.startsWith('.'))
            .map(entry => ({
              name: entry.name,
              isDirectory: entry.isDirectory(),
              path: path.join(resolved, entry.name),
            }))
            .sort((a, b) => {
              // Directories first, then alphabetically
              if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
              return a.name.localeCompare(b.name)
            })
          res.end(JSON.stringify({ currentPath: resolved, entries }))
        } catch (e: any) {
          res.statusCode = 403
          res.end(JSON.stringify({ error: e.message }))
        }
      })

      // App config: persisted to data/.insighthub-config.json, editable from any client
      // Migrate from old .ai-config.json if it exists
      const configPath = path.resolve(DATA_DIR, '.insighthub-config.json')
      const legacyConfigPath = path.resolve(DATA_DIR, '.ai-config.json')
      if (fs.existsSync(legacyConfigPath) && !fs.existsSync(configPath)) {
        fs.renameSync(legacyConfigPath, configPath)
      }
      const defaultConfig: AppConfig = {
        profiles: [],
        activeProfileId: '',
        aiApiUrl: options.aiApiUrl || 'http://127.0.0.1:7001/v1',
        aiModel: options.aiModel || 'Qwen/Qwen3.5-27B-4bit',
        aiApiKey: options.aiApiKey || '',
        quizDifficulty: 'medium',
        quizQuestionCount: 5,
        tts: { ttsApiUrl: '', ttsModel: '', ttsVoice: '' },
      }
      let appConfig = loadAppConfig(configPath, defaultConfig)

      function persistConfig(): void {
        fs.writeFileSync(configPath, JSON.stringify(appConfig, null, 2), 'utf-8')
      }

      function configGetResponse(): Record<string, any> {
        return {
          profiles: appConfig.profiles.map(p => ({
            ...p,
            aiApiKey: maskApiKey(p.aiApiKey),
          })),
          activeProfileId: appConfig.activeProfileId,
          quizDifficulty: appConfig.quizDifficulty,
          quizQuestionCount: appConfig.quizQuestionCount,
          tts: appConfig.tts || { ttsApiUrl: '', ttsModel: '', ttsVoice: '' },
        }
      }

      // GET /api/ai/config — return config (apiKey masked)
      // POST /api/ai/config — save config from client (legacy flat update + profile CRUD)
      server.middlewares.use('/api/ai/config', (req, res) => {
        res.setHeader('Content-Type', 'application/json')

        if (req.method === 'POST') {
          const chunks: Buffer[] = []
          req.on('data', (chunk: Buffer) => chunks.push(chunk))
          req.on('end', () => {
            try {
              const update = JSON.parse(Buffer.concat(chunks).toString())

              // Profile CRUD actions
              if (update.action === 'switchProfile') {
                const target = appConfig.profiles.find(p => p.id === update.profileId)
                if (!target) {
                  res.statusCode = 404
                  res.end(JSON.stringify({ error: 'Profile not found' }))
                  return
                }
                appConfig.activeProfileId = target.id
                // Sync top-level legacy fields
                appConfig.aiApiUrl = target.aiApiUrl
                appConfig.aiModel = target.aiModel
                appConfig.aiApiKey = target.aiApiKey
                persistConfig()
                res.end(JSON.stringify({ ok: true, ...configGetResponse() }))
                return
              }

              if (update.action === 'saveProfile') {
                const profile = update.profile as AIProfile
                if (!profile || !profile.aiApiUrl) {
                  res.statusCode = 400
                  res.end(JSON.stringify({ error: 'Missing required profile fields' }))
                  return
                }
                if (!profile.id) profile.id = generateProfileId()
                if (!profile.name) profile.name = 'New Config'
                // Preserve existing apiKey if client sent a masked value
                const idx = appConfig.profiles.findIndex(p => p.id === profile.id)
                if (idx >= 0 && profile.aiApiKey && profile.aiApiKey.includes('●')) {
                  profile.aiApiKey = appConfig.profiles[idx].aiApiKey
                }
                if (idx >= 0) {
                  appConfig.profiles[idx] = profile
                } else {
                  appConfig.profiles.push(profile)
                }
                // If this profile is active, sync legacy fields
                if (profile.id === appConfig.activeProfileId) {
                  appConfig.aiApiUrl = profile.aiApiUrl
                  appConfig.aiModel = profile.aiModel
                  appConfig.aiApiKey = profile.aiApiKey
                }
                persistConfig()
                res.end(JSON.stringify({ ok: true, ...configGetResponse() }))
                return
              }

              if (update.action === 'deleteProfile') {
                if (update.profileId === appConfig.activeProfileId) {
                  res.statusCode = 400
                  res.end(JSON.stringify({ error: 'Cannot delete active profile' }))
                  return
                }
                const before = appConfig.profiles.length
                appConfig.profiles = appConfig.profiles.filter(p => p.id !== update.profileId)
                if (appConfig.profiles.length === before) {
                  res.statusCode = 404
                  res.end(JSON.stringify({ error: 'Profile not found' }))
                  return
                }
                persistConfig()
                res.end(JSON.stringify({ ok: true, ...configGetResponse() }))
                return
              }

              // Legacy flat update (backward compat)
              if (typeof update.aiApiUrl === 'string') appConfig.aiApiUrl = update.aiApiUrl
              if (typeof update.aiModel === 'string') appConfig.aiModel = update.aiModel
              if (typeof update.aiApiKey === 'string') appConfig.aiApiKey = update.aiApiKey
              if (typeof update.quizDifficulty === 'string') appConfig.quizDifficulty = update.quizDifficulty
              if (typeof update.quizQuestionCount === 'number') appConfig.quizQuestionCount = update.quizQuestionCount
              if (update.tts && typeof update.tts === 'object') appConfig.tts = update.tts
              // Sync active profile with updated legacy fields
              const active = getActiveProfile(appConfig)
              if (active) {
                if (typeof update.aiApiUrl === 'string') active.aiApiUrl = update.aiApiUrl
                if (typeof update.aiModel === 'string') active.aiModel = update.aiModel
                if (typeof update.aiApiKey === 'string') active.aiApiKey = update.aiApiKey
              }
              persistConfig()
              res.end(JSON.stringify({ ok: true, ...configGetResponse() }))
            } catch {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Invalid JSON' }))
            }
          })
          return
        }

        // GET
        res.end(JSON.stringify(configGetResponse()))
      })

      // Helper: normalize base URL — strip trailing path segments like /v1, /chat/completions, etc.
      const normalizeBaseUrl = (url: string) => url.replace(/\/+$/, '').replace(/\/(v\d+|chat\/completions|models)$/, '')

      // Helper: resolve target URL from active profile
      const resolveTargetUrl = () => {
        const active = getActiveProfile(appConfig)
        const base = normalizeBaseUrl(active?.aiApiUrl || appConfig.aiApiUrl)
        return `${base}/v1/chat/completions`
      }

      // Cache: detect if server is Ollama (has /api/tags endpoint)
      const ollamaCache = new Map<string, { isOllama: boolean; ts: number }>()
      const OLLAMA_CACHE_TTL = 60_000 // re-detect every 60s
      async function isOllamaServer(baseUrl: string): Promise<boolean> {
        const cached = ollamaCache.get(baseUrl)
        if (cached && Date.now() - cached.ts < OLLAMA_CACHE_TTL) return cached.isOllama
        try {
          const probe = await fetch(`${baseUrl}/api/tags`, {
            signal: AbortSignal.timeout(3000),
          })
          const isOllama = probe.ok
          ollamaCache.set(baseUrl, { isOllama, ts: Date.now() })
          return isOllama
        } catch {
          ollamaCache.set(baseUrl, { isOllama: false, ts: Date.now() })
          return false
        }
      }

      // AI proxy: fetch available models from the configured AI server
      // Supports optional ?url=...&apiKey=... query params to test arbitrary servers
      server.middlewares.use('/api/ai/models', async (req, res) => {
        if (req.method !== 'GET') {
          res.statusCode = 405
          res.end('Method Not Allowed')
          return
        }
        res.setHeader('Content-Type', 'application/json')
        const params = new URL(req.url || '/', 'http://localhost').searchParams
        const overrideUrl = params.get('url')
        const overrideApiKey = params.get('apiKey')
        const active = getActiveProfile(appConfig)
        const rawUrl = overrideUrl || active?.aiApiUrl || appConfig.aiApiUrl
        const baseUrl = normalizeBaseUrl(rawUrl)
        const apiKey = overrideApiKey !== null ? overrideApiKey : (active?.aiApiKey ?? appConfig.aiApiKey)
        const modelsUrl = `${baseUrl}/v1/models`
        try {
          const headers: Record<string, string> = { 'Content-Type': 'application/json' }
          if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
          const aiRes = await fetch(modelsUrl, { headers, signal: AbortSignal.timeout(60000) })
          if (!aiRes.ok) {
            const body = await aiRes.text().catch(() => '')
            res.statusCode = aiRes.status >= 500 ? 502 : aiRes.status
            res.end(JSON.stringify({ error: `${baseUrl} returned ${aiRes.status}: ${body.slice(0, 120)}` }))
            return
          }
          const data = await aiRes.json()
          res.end(JSON.stringify(data))
        } catch (e: any) {
          res.statusCode = 502
          const reason = e.cause?.code === 'ECONNREFUSED' ? 'Connection refused, please make sure the service is running' : e.message
          res.end(JSON.stringify({ error: `Unable to connect to ${baseUrl}: ${reason}` }))
        }
      })

      // AI proxy: forward chat/completions requests to the configured AI model
      // When request includes `think` parameter, use Ollama native API for proper support
      server.middlewares.use('/api/ai/chat/completions', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method Not Allowed')
          return
        }

        const active = getActiveProfile(appConfig)
        const currentModel = active?.aiModel || appConfig.aiModel
        const currentApiKey = active?.aiApiKey ?? appConfig.aiApiKey

        // Read request body and inject server-side model
        const reqChunks: Buffer[] = []
        for await (const chunk of req) reqChunks.push(chunk as Buffer)
        const rawBody = Buffer.concat(reqChunks)

        const proxyHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
        }
        if (currentApiKey) {
          proxyHeaders['Authorization'] = `Bearer ${currentApiKey}`
        } else if (req.headers['authorization']) {
          proxyHeaders['Authorization'] = req.headers['authorization'] as string
        }

        try {
          let parsed: any
          try { parsed = JSON.parse(rawBody.toString()) } catch {}
          if (!parsed) { res.statusCode = 400; res.end('{"error":"Invalid JSON"}'); return }

          parsed.model = currentModel
          const baseUrl = normalizeBaseUrl(active?.aiApiUrl || appConfig.aiApiUrl)

          // If request includes `think` param AND server is Ollama, use native API
          const useOllamaNative = 'think' in parsed && await isOllamaServer(baseUrl)
          if (useOllamaNative) {
            console.log(`[AI proxy] Ollama detected → using native API, model=${parsed.model}, stream=${!!parsed.stream}, think=${parsed.think}`)
            const isStream = !!parsed.stream
            const ollamaBody: Record<string, any> = {
              model: currentModel,
              messages: parsed.messages,
              stream: isStream,
              think: parsed.think,
            }
            if (parsed.temperature != null) ollamaBody.options = { temperature: parsed.temperature }
            if (parsed.max_tokens != null) {
              ollamaBody.options = { ...ollamaBody.options, num_predict: parsed.max_tokens }
            }

            const aiRes = await fetch(`${baseUrl}/api/chat`, {
              method: 'POST',
              headers: proxyHeaders,
              body: Buffer.from(JSON.stringify(ollamaBody)),
            })

            if (!aiRes.ok) {
              // Ollama native API failed — fall back to OpenAI endpoint
              const fallbackBody = { ...parsed }
              delete fallbackBody.think
              // Keep chat_template_kwargs for vLLM/transformers servers
              const fbRes = await fetch(resolveTargetUrl(), {
                method: 'POST',
                headers: proxyHeaders,
                body: Buffer.from(JSON.stringify(fallbackBody)),
              })
              res.writeHead(fbRes.status, {
                'Content-Type': fbRes.headers.get('content-type') || 'application/json',
                'Cache-Control': 'no-cache',
              })
              if (fbRes.body) {
                const reader = fbRes.body.getReader()
                try { while (true) { const { done, value } = await reader.read(); if (done) break; res.write(value) } } finally { reader.releaseLock() }
              }
              res.end()
              return
            }

            if (!isStream) {
              // Non-streaming: convert Ollama response → OpenAI format
              const ollamaData: any = await aiRes.json()
              const openaiRes = {
                id: `chatcmpl-${Date.now()}`,
                object: 'chat.completion',
                created: Math.floor(Date.now() / 1000),
                model: currentModel,
                choices: [{
                  index: 0,
                  message: ollamaData.message || { role: 'assistant', content: '' },
                  finish_reason: ollamaData.done ? 'stop' : 'length',
                }],
                usage: {
                  prompt_tokens: ollamaData.prompt_eval_count || 0,
                  completion_tokens: ollamaData.eval_count || 0,
                  total_tokens: (ollamaData.prompt_eval_count || 0) + (ollamaData.eval_count || 0),
                },
              }
              res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' })
              res.end(JSON.stringify(openaiRes))
            } else {
              // Streaming: convert Ollama NDJSON → OpenAI SSE
              res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
              const reader = aiRes.body!.getReader()
              const decoder = new TextDecoder()
              let sseBuffer = ''
              try {
                while (true) {
                  const { done, value } = await reader.read()
                  if (done) break
                  sseBuffer += decoder.decode(value, { stream: true })
                  const lines = sseBuffer.split('\n')
                  sseBuffer = lines.pop() || ''
                  for (const line of lines) {
                    if (!line.trim()) continue
                    try {
                      const chunk = JSON.parse(line)
                      const sseData = {
                        id: `chatcmpl-${Date.now()}`,
                        object: 'chat.completion.chunk',
                        model: currentModel,
                        choices: [{
                          index: 0,
                          delta: chunk.message || {},
                          finish_reason: chunk.done ? 'stop' : null,
                        }],
                      }
                      res.write(`data: ${JSON.stringify(sseData)}\n\n`)
                    } catch {}
                  }
                }
              } finally {
                reader.releaseLock()
              }
              res.write('data: [DONE]\n\n')
              res.end()
            }
            return
          }

          // Standard OpenAI-compatible proxy (no `think` param)
          const body = Buffer.from(JSON.stringify(parsed))
          const aiRes = await fetch(resolveTargetUrl(), {
            method: 'POST',
            headers: proxyHeaders,
            body,
          })

          res.writeHead(aiRes.status, {
            'Content-Type': aiRes.headers.get('content-type') || 'application/json',
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

      // TTS proxy: forward OpenAI-compatible /v1/audio/speech requests
      // Reads base URL from X-TTS-Base-URL header or falls back to server-side tts config.
      server.middlewares.use('/api/ai/tts', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method Not Allowed')
          return
        }

        const ttsBaseUrl = (req.headers['x-tts-base-url'] as string) || appConfig.tts?.ttsApiUrl || ''
        if (!ttsBaseUrl) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'TTS not configured. Set TTS API URL in Settings.' }))
          return
        }

        // Read request body
        const reqChunks: Buffer[] = []
        for await (const chunk of req) reqChunks.push(chunk as Buffer)
        const rawBody = Buffer.concat(reqChunks)

        let parsed: any
        try { parsed = JSON.parse(rawBody.toString()) } catch {
          res.statusCode = 400
          res.end(JSON.stringify({ error: 'Invalid JSON' }))
          return
        }

        // Build the target URL — normalize to avoid double /v1/v1
        const base = ttsBaseUrl.replace(/\/+$/, '')
        const targetUrl = base.endsWith('/v1') ? `${base}/audio/speech` : `${base}/v1/audio/speech`

        // Inject server-side TTS model/voice if client didn't provide them
        if (!parsed.model && appConfig.tts?.ttsModel) parsed.model = appConfig.tts.ttsModel
        if (!parsed.voice && appConfig.tts?.ttsVoice) parsed.voice = appConfig.tts.ttsVoice

        const proxyHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
        }
        // Forward API key if available in AI config
        const active = getActiveProfile(appConfig)
        const apiKey = active?.aiApiKey ?? appConfig.aiApiKey
        if (apiKey) proxyHeaders['Authorization'] = `Bearer ${apiKey}`

        try {
          const aiRes = await fetch(targetUrl, {
            method: 'POST',
            headers: proxyHeaders,
            body: Buffer.from(JSON.stringify(parsed)),
          })

          if (!aiRes.ok) {
            const errBody = await aiRes.text().catch(() => '')
            res.writeHead(aiRes.status, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: `TTS upstream error: ${aiRes.status}`, detail: errBody.slice(0, 200) }))
            return
          }

          const contentType = aiRes.headers.get('content-type') || 'audio/mpeg'
          res.writeHead(200, {
            'Content-Type': contentType,
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
          res.end(JSON.stringify({ error: `TTS proxy error: ${e.message}` }))
        }
      })

      // Quiz persistence: shared across all LAN clients via data/.insighthub-quizzes.json
      const quizzesPath = path.resolve(DATA_DIR, '.insighthub-quizzes.json')

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

      // Read meta persistence: shared across all LAN clients via data/.insighthub-read-meta.json
      const readMetaPath = path.resolve(DATA_DIR, '.insighthub-read-meta.json')

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

      // Read history persistence: shared across all LAN clients via data/.insighthub-read-history.json
      const readHistoryPath = path.resolve(DATA_DIR, '.insighthub-read-history.json')

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

      // Quiz history persistence: shared across all LAN clients via data/.insighthub-quiz-history.json
      const quizHistoryPath = path.resolve(DATA_DIR, '.insighthub-quiz-history.json')

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
              // Dedup: skip if an entry with the same id already exists
              if (attempt.id && history.some((h: any) => h.id === attempt.id)) {
                res.end(JSON.stringify({ ok: true }))
                return
              }
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

      // Tags persistence: shared across all LAN clients via data/.insighthub-tags.json
      const tagsPath = path.resolve(DATA_DIR, '.insighthub-tags.json')

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

      // Annotations persistence: shared across all LAN clients via data/.insighthub-annotations.json
      const annotationsPath = path.resolve(DATA_DIR, '.insighthub-annotations.json')

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

      // Concept cards persistence: shared across all LAN clients via data/.insighthub-concept-cards.json
      const conceptCardsPath = path.resolve(DATA_DIR, '.insighthub-concept-cards.json')

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

      // Imported documents: written directly to TechInsight/<category>/, legacy metadata in data/.insighthub-imported-docs.json
      const importedDocsPath = path.resolve(DATA_DIR, '.insighthub-imported-docs.json')
      const IMPORT_DOC_SIZE_LIMIT = 5 * 1024 * 1024 // 5MB

      interface ImportedDocRecord {
        id: string
        fileName: string
        source: string
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
      // POST /api/imported-documents — save new imported doc to the target workspace
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

              // Generate ID matching scanDocuments format: <prefix>-<category>-<name>
              const nameWithoutExt = body.fileName.replace(/\.html$/, '')
              const workspaces = loadWorkspaces()
              const ws = workspaces.find(w => w.id === body.source) || workspaces[0]
              const prefix = ws.prefix || ws.id
              const id = `${prefix}-${body.category}-${nameWithoutExt}`
              const dirs = getWorkspaceDirs()
              const wsDir = dirs[ws.id]
              if (!wsDir) {
                res.statusCode = 400
                res.end(JSON.stringify({ error: `Workspace "${ws.label}" not configured` }))
                return
              }
              const destDir = path.join(wsDir, body.category)
              const destPath = path.join(destDir, body.fileName)

              // Ensure category directory exists
              fs.mkdirSync(destDir, { recursive: true })
              // Write HTML directly to the target workspace
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
          // Remove the HTML file from the correct workspace dir, then legacy imports dir
          if (target) {
            const dirs = getWorkspaceDirs()
            const wsDir = target.source ? dirs[target.source] : undefined
            const wsPath = wsDir
              ? path.join(wsDir, target.category, target.fileName)
              : ''
            if (wsPath && fs.existsSync(wsPath)) {
              fs.unlinkSync(wsPath)
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

      // Generic client storage sync: shared across all LAN clients via data/.insighthub-client-storage.json
      // Keys that already have dedicated sync endpoints are excluded on the client side.
      const clientStoragePath = path.resolve(DATA_DIR, '.insighthub-client-storage.json')

      function loadClientStorageFile(): Record<string, any> {
        try {
          if (fs.existsSync(clientStoragePath)) {
            return JSON.parse(fs.readFileSync(clientStoragePath, 'utf-8'))
          }
        } catch {}
        return {}
      }

      function saveClientStorageFile(data: Record<string, any>): void {
        fs.writeFileSync(clientStoragePath, JSON.stringify(data, null, 2), 'utf-8')
      }

      server.middlewares.use('/api/client-storage', (req, res) => {
        res.setHeader('Content-Type', 'application/json')

        if (req.method === 'GET') {
          res.end(JSON.stringify(loadClientStorageFile()))
          return
        }

        if (req.method === 'POST') {
          const chunks: Buffer[] = []
          req.on('data', (chunk: Buffer) => chunks.push(chunk))
          req.on('end', () => {
            try {
              const { key, value } = JSON.parse(Buffer.concat(chunks).toString())
              if (!key) {
                res.statusCode = 400
                res.end(JSON.stringify({ error: 'Missing key' }))
                return
              }
              const data = loadClientStorageFile()
              data[key] = value
              saveClientStorageFile(data)
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

        const source = segments[0] // mindinsight, techinsight, or any workspace id
        const relativePath = segments.slice(1).join(path.sep)

        const dirs = getWorkspaceDirs()
        const baseDir = dirs[source]
        if (!baseDir) {
          res.statusCode = 404
          res.end('Not Found')
          return
        }
        const absPath = path.resolve(baseDir, relativePath)

        // Security: ensure the resolved path is within the allowed directory
        if (!absPath.startsWith(baseDir)) {
          res.statusCode = 403
          res.end('Forbidden')
          return
        }

        sendFile(res, absPath)
      })

      // Runtime detection: probe for available language runtimes on startup
      interface RuntimeInfo { command: string; label: string }
      const RUNTIME_MAP: Record<string, RuntimeInfo> = {
        python:     { command: 'python3', label: 'Python' },
        javascript: { command: 'node', label: 'Node.js' },
        typescript: { command: 'npx', label: 'npx (TypeScript)' },
        go:         { command: 'go', label: 'Go' },
        java:       { command: 'javac', label: 'Java' },
        cpp:        { command: 'g++', label: 'C++ (g++)' },
        rust:       { command: 'rustc', label: 'Rust' },
      }
      const availableRuntimes = new Set<string>()
      for (const [lang, info] of Object.entries(RUNTIME_MAP)) {
        try { execSync(`which ${info.command} 2>/dev/null`, { timeout: 2000 }); availableRuntimes.add(lang) } catch {}
      }

      // GET /api/code-runtimes — return list of available language runtimes
      server.middlewares.use('/api/code-runtimes', (req, res) => {
        if (req.method !== 'GET') { res.statusCode = 405; res.end('Method Not Allowed'); return }
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify([...availableRuntimes]))
      })

      // POST /api/code-run — execute code and stream stdout+stderr via SSE
      server.middlewares.use('/api/code-run', async (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end('Method Not Allowed'); return }
        if (!availableRuntimes.size) { res.statusCode = 503; res.end(JSON.stringify({ error: 'No runtimes available' })); return }

        const reqChunks: Buffer[] = []
        for await (const chunk of req) reqChunks.push(chunk as Buffer)
        let parsed: { code: string; language: string }
        try { parsed = JSON.parse(Buffer.concat(reqChunks).toString()) } catch { res.statusCode = 400; res.end('Invalid JSON'); return }

        const { code, language } = parsed
        if (!code || !language) { res.statusCode = 400; res.end('Missing code or language'); return }
        if (!availableRuntimes.has(language)) { res.statusCode = 400; res.end(`Runtime for ${language} not found`); return }

        const tmpDir = os.tmpdir()
        const tmpId = `insighthub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const TIMEOUT_MS = 10_000

        res.setHeader('Content-Type', 'text/event-stream')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Connection', 'keep-alive')

        const sendEvent = (data: string) => res.write(`data: ${JSON.stringify(data)}\n\n`)

        let command: string
        let needsCleanup: string[] = []

        try {
          switch (language) {
            case 'python':
              command = 'python3 -u -'
              break
            case 'javascript':
              command = 'node --input-type=module -'
              break
            case 'typescript':
              command = 'npx tsx -'
              break
            case 'go': {
              const goFile = path.join(tmpDir, `${tmpId}.go`)
              fs.writeFileSync(goFile, code)
              needsCleanup.push(goFile)
              command = `go run "${goFile}"`
              break
            }
            case 'java': {
              const javaFile = path.join(tmpDir, `${tmpId}.java`)
              const classMatch = code.match(/public\s+class\s+(\w+)/)
              const className = classMatch ? classMatch[1] : 'Main'
              fs.writeFileSync(javaFile, code)
              needsCleanup.push(javaFile)
              command = `cd "${tmpDir}" && javac "${javaFile}" && java ${className}`
              break
            }
            case 'cpp': {
              const cppFile = path.join(tmpDir, `${tmpId}.cpp`)
              const outFile = path.join(tmpDir, `${tmpId}_out`)
              fs.writeFileSync(cppFile, code)
              needsCleanup.push(cppFile, outFile)
              command = `g++ -o "${outFile}" "${cppFile}" && "${outFile}"`
              break
            }
            case 'rust': {
              const rsFile = path.join(tmpDir, `${tmpId}.rs`)
              const outFile = path.join(tmpDir, `${tmpId}_out`)
              fs.writeFileSync(rsFile, code)
              needsCleanup.push(rsFile, outFile)
              command = `rustc -o "${outFile}" "${rsFile}" && "${outFile}"`
              break
            }
            default:
              res.statusCode = 400
              res.end(`Unsupported language: ${language}`)
              return
          }

          const isStdin = (language === 'python' || language === 'javascript' || language === 'typescript')
          const proc = exec(command, {
            timeout: TIMEOUT_MS,
            maxBuffer: 1024 * 1024,
            env: { ...process.env },
          })

          if (isStdin) proc.stdin!.end(code)

          let done = false
          const finish = () => {
            if (done) return
            done = true
            res.end()
            for (const f of needsCleanup) { try { fs.unlinkSync(f) } catch {} }
          }

          proc.stdout?.on('data', (d: Buffer) => sendEvent(d.toString()))
          proc.stderr?.on('data', (d: Buffer) => sendEvent(d.toString()))
          proc.on('error', (err) => { sendEvent(`\n[Error] ${err.message}\n`); finish() })
          proc.on('close', (code) => { if (code) sendEvent(`\n[Exit ${code}]\n`); finish() })
          req.on('close', () => { proc.kill(); finish() })
        } catch (err: any) {
          sendEvent(`\n[Error] ${err.message}\n`)
          res.end()
          for (const f of needsCleanup) { try { fs.unlinkSync(f) } catch {} }
        }
      })
    },
  }
}
