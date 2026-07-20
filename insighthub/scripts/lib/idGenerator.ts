import * as path from 'path'

/**
 * Generate a simplified document ID: `prefix-filename` (no category in the ID).
 * Used by import/move endpoints where conflict checking is not needed
 * (manifest reconciliation will handle it).
 */
export function generateId(prefix: string, fileName: string): string {
  const ext = path.extname(fileName)
  const nameWithoutExt = ext ? fileName.slice(0, -ext.length) : fileName
  return `${prefix}-${nameWithoutExt}`
}

/**
 * Generate a document ID with conflict resolution.
 *
 * Strategy:
 *  1. `prefix-filename`                     (primary, e.g. mi-ancient-zh)
 *  2. `prefix-parentDir-filename`           (fallback, e.g. mi-architecture-ancient-zh)
 *  3. `prefix-fullDirPath-filename`          (fallback2, e.g. mi-art-history-ancient-zh)
 *  4. `prefix-filename-2`                    (last resort with numeric suffix)
 *
 * @param prefix      Workspace prefix (e.g. 'mi', 'ti')
 * @param relativePath  File path relative to workspace root (e.g. 'art-history/ancient-zh.html')
 * @param fileName      Just the filename (e.g. 'ancient-zh.html')
 * @param usedIds       Set of already-allocated IDs (to detect collisions)
 */
export function generateIdWithConflictResolution(
  prefix: string,
  relativePath: string,
  fileName: string,
  usedIds: Set<string>,
): string {
  const ext = path.extname(fileName)
  const nameWithoutExt = ext ? fileName.slice(0, -ext.length) : fileName

  // Primary: prefix-filename
  const primary = `${prefix}-${nameWithoutExt}`
  if (!usedIds.has(primary)) return primary

  // Fallback: prefix-parentDir-filename (immediate parent directory)
  const dirParts = relativePath
    .split(path.sep)
    .filter(s => s.length > 0)
    .slice(0, -1) // exclude the filename

  if (dirParts.length > 0) {
    // Try just the parent directory name
    const parentDir = dirParts[dirParts.length - 1]
    const fallback = `${prefix}-${parentDir}-${nameWithoutExt}`
    if (!usedIds.has(fallback)) return fallback

    // Try progressively more directory context (from shortest to longest)
    // Skip the last dir (already tried), start from second-to-last
    for (let i = dirParts.length - 2; i >= 0; i--) {
      const dirPrefix = dirParts.slice(i).join('-')
      const candidate = `${prefix}-${dirPrefix}-${nameWithoutExt}`
      if (!usedIds.has(candidate)) return candidate
    }
  }

  // Last resort: prefix-filename-2, prefix-filename-3, ...
  let counter = 2
  while (usedIds.has(`${prefix}-${nameWithoutExt}-${counter}`)) {
    counter++
  }
  return `${prefix}-${nameWithoutExt}-${counter}`
}
