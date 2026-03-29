import * as fs from 'fs'
import * as path from 'path'

// Configuration
const BASE_DIR = path.resolve(__dirname, '..')
const MINDINSIGHT_DIR = path.resolve(BASE_DIR, '../MindInsight')
const TECHINSIGHT_DIR = path.resolve(BASE_DIR, '../TechInsight')
const OUTPUT_DIR = path.resolve(BASE_DIR, 'public/docs')

const EXCLUDE_DIRS = ['backups', 'template']
const EXCLUDE_FILES = ['index.html']

function isExcluded(filePath: string): boolean {
  const parts = filePath.split(path.sep)
  for (const exclude of EXCLUDE_DIRS) {
    if (parts.includes(exclude)) return true
  }
  for (const exclude of EXCLUDE_FILES) {
    if (parts[parts.length - 1] === exclude) return true
  }
  return false
}

function getRelativeFromSource(absPath: string, sourceDir: string, sourceName: string): string {
  const relative = path.relative(sourceDir, absPath)
  return path.join(sourceName, relative)
}

function copyRecursive(src: string, dest: string): void {
  const stat = fs.statSync(src)
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true })
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry))
    }
  } else {
    fs.copyFileSync(src, dest)
  }
}

function main() {
  console.log('Copying documents to public/docs/...')

  // Clean output directory
  if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true })
  }

  let totalFiles = 0

  // Copy MindInsight files
  if (fs.existsSync(MINDINSIGHT_DIR)) {
    for (const entry of fs.readdirSync(MINDINSIGHT_DIR, { recursive: true })) {
      const absPath = path.join(MINDINSIGHT_DIR, entry as string)
      if (typeof entry === 'string' && fs.statSync(absPath).isFile() && entry.endsWith('.html')) {
        if (isExcluded(entry)) continue
        const relPath = getRelativeFromSource(absPath, MINDINSIGHT_DIR, 'mindinsight')
        const destPath = path.join(OUTPUT_DIR, relPath)
        fs.mkdirSync(path.dirname(destPath), { recursive: true })
        fs.copyFileSync(absPath, destPath)
        totalFiles++
      }
    }
  }

  // Copy TechInsight files
  if (fs.existsSync(TECHINSIGHT_DIR)) {
    for (const entry of fs.readdirSync(TECHINSIGHT_DIR, { recursive: true })) {
      const absPath = path.join(TECHINSIGHT_DIR, entry as string)
      if (typeof entry === 'string' && fs.statSync(absPath).isFile() && entry.endsWith('.html')) {
        if (isExcluded(entry)) continue
        const relPath = getRelativeFromSource(absPath, TECHINSIGHT_DIR, 'techinsight')
        const destPath = path.join(OUTPUT_DIR, relPath)
        fs.mkdirSync(path.dirname(destPath), { recursive: true })
        fs.copyFileSync(absPath, destPath)
        totalFiles++
      }
    }
  }

  console.log(`Copied ${totalFiles} files to public/docs/`)
}

main()
