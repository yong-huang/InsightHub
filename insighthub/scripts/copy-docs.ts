import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { scanDocuments, scanWithManifest } from './lib/scanDocuments'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const BASE_DIR = path.resolve(__dirname, '..')
const MINDINSIGHT_DIR = path.resolve(BASE_DIR, '../../MindInsight')
const TECHINSIGHT_DIR = path.resolve(BASE_DIR, '../../TechInsight')
const LEETCODEINSIGHT_DIR = path.resolve(BASE_DIR, '../../LeetCodeInsight')
const OUTPUT_DIR = path.resolve(BASE_DIR, 'public/docs')
const WORKSPACES_CONFIG = path.resolve(BASE_DIR, '.insighthub-workspaces.json')

const SOURCE_BASES: Record<string, string> = {
  mindinsight: MINDINSIGHT_DIR,
  techinsight: TECHINSIGHT_DIR,
  leetcodeinsight: LEETCODEINSIGHT_DIR,
}

interface WorkspaceEntry {
  id: string
  label: string
  icon: string
  path: string
  prefix: string
}

const builtinIds = new Set(['mindinsight', 'techinsight', 'leetcodeinsight'])

function main() {
  console.log('Copying documents to public/docs/...')

  // Clean output directory
  if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true })
  }

  const manifest = scanDocuments(MINDINSIGHT_DIR, TECHINSIGHT_DIR, LEETCODEINSIGHT_DIR)

  // Scan dynamic workspaces
  try {
    if (fs.existsSync(WORKSPACES_CONFIG)) {
      const wsConfig: WorkspaceEntry[] = JSON.parse(fs.readFileSync(WORKSPACES_CONFIG, 'utf-8'))
      for (const ws of wsConfig) {
        if (!builtinIds.has(ws.id) && ws.path) {
          const absPath = path.isAbsolute(ws.path) ? ws.path : path.resolve(BASE_DIR, ws.path)
          SOURCE_BASES[ws.id] = absPath
          manifest.push(...scanWithManifest(absPath, ws.id, ws.prefix || ws.id.slice(0, 2), ws.label))
        }
      }
    }
  } catch {}

  let totalFiles = 0

  for (const entry of manifest) {
    const sourceBase = SOURCE_BASES[entry.source]
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
