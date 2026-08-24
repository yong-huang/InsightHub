import { callAI, extractJSON } from './aiService'
import { storageService } from './storageService'
import { recordUsage } from './tokenUsageService'
import { getCategoryInfo } from '@/utils/categoryMap'
import type { Document } from '@/types'

export interface StudyPlanMatch {
  docId: string
  reason: string
  priority: 'high' | 'medium' | 'low'
}

export interface StudyPlanResult {
  id: string
  input: string
  summary: string
  matches: StudyPlanMatch[]
  createdAt: number
  workspace: string
}

/** Simple deterministic hash from string */
function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return 'sp-' + Math.abs(hash).toString(36)
}

interface CatalogEntry {
  id: string
  title: string
  category: string
}

function buildDocumentCatalog(documents: Map<string, Document>, workspace: string): CatalogEntry[] {
  const entries: CatalogEntry[] = []
  for (const doc of documents.values()) {
    if (doc.source !== workspace) continue
    entries.push({ id: doc.id, title: doc.title, category: doc.category })
  }
  return entries
}

export async function generateStudyPlan(
  input: string,
  documents: Map<string, Document>,
  activeWorkspace: string,
): Promise<StudyPlanResult> {
  const catalog = buildDocumentCatalog(documents, activeWorkspace)

  // Group by category
  const byCat = new Map<string, CatalogEntry[]>()
  for (const entry of catalog) {
    const list = byCat.get(entry.category) ?? []
    list.push(entry)
    byCat.set(entry.category, list)
  }

  // ── Stage 1: Ask AI to pick relevant categories ──
  const categoryList = Array.from(byCat.entries())
    .map(([catKey, entries]) => `${catKey} (${getCategoryInfo(catKey).label}, ${entries.length} docs)`)
    .join('\n')

  const stage1Messages = [
    {
      role: 'system' as const,
      content: `You are a learning planning advisor. Given a user's job description or learning goal, select ALL potentially relevant categories from the list below. Be generous — include categories that are directly required as well as those that provide useful background knowledge. Return ONLY a JSON array of category keys (strings), no other text. Select 3-8 categories.

Categories:
${categoryList}`,
    },
    { role: 'user' as const, content: input },
  ]

  const stage1 = await callAI(stage1Messages, 60000, 512)
  if (stage1.usage) recordUsage('study-plan', stage1.usage)
  if (!stage1.success || !stage1.data) {
    throw new Error(stage1.error || 'Failed to select categories')
  }

  let selectedCats: string[]
  try {
    const parsed = extractJSON(String(stage1.data))
    selectedCats = Array.isArray(parsed) ? parsed.filter(c => typeof c === 'string' && byCat.has(c)) : []
  } catch {
    selectedCats = []
  }

  // Fallback: if AI failed to pick categories, use all
  if (selectedCats.length === 0) {
    selectedCats = Array.from(byCat.keys())
  }

  // ── Stage 2: Build compact catalog from selected categories, ask for doc matches ──
  const filteredEntries: CatalogEntry[] = []
  for (const cat of selectedCats) {
    filteredEntries.push(...(byCat.get(cat) ?? []))
  }

  const catalogLines: string[] = []
  for (const cat of selectedCats) {
    const catLabel = getCategoryInfo(cat).label
    const entries = byCat.get(cat) ?? []
    catalogLines.push(`[${catLabel}]`)
    for (const e of entries) {
      catalogLines.push(`  ${e.id} | ${e.title}`)
    }
  }
  const catalogText = catalogLines.join('\n')

  const stage2Messages = [
    {
      role: 'system' as const,
      content: `You are a learning planning advisor. The user will provide a job description, interview position, or learning goal. Based on the document catalog below, select ALL relevant documents and return a JSON response.

Document catalog (grouped by category, format: id | title):
${catalogText}

Instructions:
1. Be thorough — select ALL documents that are relevant, including directly matching topics and foundational background knowledge. Aim for 15-40 matches. It is better to include a borderline-relevant document than to miss an important one.
2. For each category that appears in the catalog, if ANY document in that category is relevant, review ALL documents in that category — do not stop after finding a few matches.
3. For each match, provide:
   - docId: exact id from the catalog
   - reason: a short explanation of why this document is relevant (for tooltip)
   - priority: "high" (directly required), "medium" (useful background), or "low" (supplementary)
4. Provide a concise summary of the study plan recommendation.
5. Return ONLY valid JSON, no other text.

JSON format:
{"summary": "...", "matches": [{"docId": "...", "reason": "...", "priority": "high|medium|low"}]}`,
    },
    { role: 'user' as const, content: input },
  ]

  const validDocIds = new Set(filteredEntries.map(e => e.id))
  const result = await callAI(stage2Messages, 180000, 4096)
  if (result.usage) recordUsage('study-plan', result.usage)

  if (!result.success || !result.data) {
    throw new Error(result.error || 'AI call failed')
  }

  const parsed = extractJSON(String(result.data)) as { summary?: unknown; matches?: unknown }
  const summary = typeof parsed.summary === 'string' ? parsed.summary : ''
  const rawMatches = Array.isArray(parsed.matches) ? (parsed.matches as Record<string, unknown>[]) : []

  // Filter out hallucinated docIds
  const matches: StudyPlanMatch[] = rawMatches
    .filter((m): m is { docId: string; reason?: unknown; priority?: unknown } => !!m && typeof m.docId === 'string' && validDocIds.has(m.docId))
    .map(m => ({
      docId: m.docId,
      reason: typeof m.reason === 'string' ? m.reason : '',
      priority: m.priority === 'high' || m.priority === 'medium' || m.priority === 'low' ? m.priority : 'medium',
    }))

  const plan: StudyPlanResult = {
    id: simpleHash(input),
    input,
    summary,
    matches,
    createdAt: Date.now(),
    workspace: activeWorkspace,
  }

  storageService.saveStudyPlan(plan)
  return plan
}

// ── Module-level ongoing generation state (survives component unmount) ──

let _ongoing: {
  promise: Promise<StudyPlanResult>
  input: string
  workspace: string
} | null = null

/** Start a generation; the promise lives at module level so it survives navigation */
export function startGeneration(
  input: string,
  documents: Map<string, Document>,
  activeWorkspace: string,
): Promise<StudyPlanResult> {
  const promise = generateStudyPlan(input, documents, activeWorkspace).finally(() => {
    if (_ongoing?.promise === promise) _ongoing = null
  })
  _ongoing = { promise, input, workspace: activeWorkspace }
  return promise
}

/** Check whether a generation is in-flight for the given workspace */
export function getOngoingGeneration(workspace: string): { promise: Promise<StudyPlanResult>; input: string } | null {
  if (_ongoing && _ongoing.workspace === workspace) return _ongoing
  return null
}

/** Load all cached plans for a workspace, newest first */
export function loadStudyPlans(workspace: string): StudyPlanResult[] {
  return storageService.getStudyPlans().filter(p => p.workspace === workspace)
}

/** Load a single plan by id */
export function loadStudyPlanById(id: string): StudyPlanResult | null {
  return storageService.getStudyPlans().find(p => p.id === id) ?? null
}

/** Delete a plan by id */
export function deleteStudyPlan(id: string): void {
  const plans = storageService.getStudyPlans().filter(p => p.id !== id)
  storageService._setStudyPlans(plans)
}
