import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import type { WorkspaceEntry } from '../src/types'
import { scanWorkspaces } from './lib/scanDocuments'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const BASE_DIR = path.resolve(__dirname, '..')
const OUTPUT_DIR = path.resolve(BASE_DIR, 'public/docs')
const WORKSPACES_CONFIG = path.resolve(BASE_DIR, '.insighthub-workspaces.json')

function loadWorkspaces(): WorkspaceEntry[] {
  try {
    if (fs.existsSync(WORKSPACES_CONFIG)) {
      const wsConfig: WorkspaceEntry[] = JSON.parse(fs.readFileSync(WORKSPACES_CONFIG, 'utf-8'))
      if (Array.isArray(wsConfig) && wsConfig.length > 0) return wsConfig
    }
  } catch {}
  return []
}

function main() {
  console.log('Copying documents to public/docs/...')

  // Clean output directory
  if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true })
  }

  const workspaces = loadWorkspaces()
  const manifest = scanWorkspaces(workspaces, BASE_DIR, { extractMetadata: true })

  // Build source base map for file copying
  const sourceBases: Record<string, string> = {}
  for (const ws of workspaces) {
    sourceBases[ws.id] = path.isAbsolute(ws.path) ? ws.path : path.resolve(BASE_DIR, ws.path)
  }

  let totalFiles = 0

  for (const entry of manifest) {
    const sourceBase = sourceBases[entry.source]
    if (!sourceBase) {
      console.warn(`  Warning: no source base for ${entry.source}`)
      continue
    }
    const categoryPath = entry.subcategory
      ? `${entry.category}/${entry.subcategory}`
      : entry.category
    const srcPath = path.join(sourceBase, categoryPath, entry.fileName)
    const destPath = path.join(OUTPUT_DIR, entry.source, categoryPath, entry.fileName)

    if (!fs.existsSync(srcPath)) {
      console.warn(`  Warning: source file not found: ${srcPath}`)
      continue
    }

    fs.mkdirSync(path.dirname(destPath), { recursive: true })
    fs.copyFileSync(srcPath, destPath)
    totalFiles++
  }

  // Write manifest.json to public/
  const manifestPath = path.resolve(BASE_DIR, 'public/manifest.json')
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true })
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))

  console.log(`Copied ${totalFiles} files to public/docs/`)
  console.log(`Wrote ${manifest.length} entries to public/manifest.json`)
}

main()
