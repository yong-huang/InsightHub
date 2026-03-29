import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { scanDocuments } from './lib/scanDocuments'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const BASE_DIR = path.resolve(__dirname, '..')
const MINDINSIGHT_DIR = path.resolve(BASE_DIR, '../../MindInsight')
const TECHINSIGHT_DIR = path.resolve(BASE_DIR, '../../TechInsight')
const OUTPUT_DIR = path.resolve(BASE_DIR, 'public/docs')

function main() {
  console.log('Copying documents to public/docs/...')

  // Clean output directory
  if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true })
  }

  const manifest = scanDocuments(MINDINSIGHT_DIR, TECHINSIGHT_DIR)
  let totalFiles = 0

  for (const entry of manifest) {
    const sourceBase = entry.source === 'mindinsight' ? MINDINSIGHT_DIR : TECHINSIGHT_DIR
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
