/**
 * Shared default workspace configuration.
 * Used by both browser code (storageService) and Node.js code
 * (scanDocuments, copy-docs, documentDiscovery) via relative import.
 *
 * Paths are relative to the InsightHub project root (i.e. insighthub/).
 * Node.js callers must resolve them against their own base directory.
 */
export interface WorkspaceEntry {
  id: string
  label: string
  icon: string
  /** Relative path from the project root (insighthub/) */
  path: string
  /** Document ID prefix, e.g. 'mi' */
  prefix: string
}

export const DEFAULT_WORKSPACES: WorkspaceEntry[] = [
  { id: 'mindinsight', label: 'MindInsight', icon: 'Brain', path: '../../MindInsight', prefix: 'mi' },
  { id: 'techinsight', label: 'TechInsight', icon: 'Cpu', path: '../../TechInsight', prefix: 'ti' },
  { id: 'leetcodeinsight', label: 'LeetcodeInsight', icon: 'Code2', path: '../../LeetCodeInsight', prefix: 'li' },
]
