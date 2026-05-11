import { callAI, extractJSON } from './aiService'
import { storageService } from './storageService'
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
      content: `You are a learning planning advisor. Given a user's job description or learning goal, select the most relevant categories from the list below. Return ONLY a JSON array of category keys (strings), no other text. Select 2-5 categories.

Categories:
${categoryList}`,
    },
    { role: 'user' as const, content: input },
  ]

  const stage1 = await callAI(stage1Messages, 60000, 512)
  if (!stage1.success || !stage1.data) {
    throw new Error(stage1.error || 'Failed to select categories')
  }

  let selectedCats: string[]
  try {
    const parsed = extractJSON(stage1.data)
    selectedCats = Array.isArray(parsed) ? parsed.filter((c: any) => typeof c === 'string' && byCat.has(c)) : []
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
      content: `You are a learning planning advisor. The user will provide a job description, interview position, or learning goal. Based on the document catalog below, select the most relevant documents and return a JSON response.

Document catalog (grouped by category, format: id | title):
${catalogText}

Instructions:
1. Select documents that are relevant to the user's input. Aim for 5-20 matches.
2. For each match, provide:
   - docId: exact id from the catalog
   - reason: a short explanation of why this document is relevant (for tooltip)
   - priority: "high", "medium", or "low"
3. Provide a concise summary of the study plan recommendation.
4. Return ONLY valid JSON, no other text.

JSON format:
{"summary": "...", "matches": [{"docId": "...", "reason": "...", "priority": "high|medium|low"}]}`,
    },
    { role: 'user' as const, content: input },
  ]

  const validDocIds = new Set(filteredEntries.map(e => e.id))
  const result = await callAI(stage2Messages, 180000, 4096)

  if (!result.success || !result.data) {
    throw new Error(result.error || 'AI call failed')
  }

  const parsed = extractJSON(result.data) as { summary?: string; matches?: any[] }
  const summary = typeof parsed.summary === 'string' ? parsed.summary : ''
  const rawMatches = Array.isArray(parsed.matches) ? parsed.matches : []

  // Filter out hallucinated docIds
  const matches: StudyPlanMatch[] = rawMatches
    .filter((m: any) => m && typeof m.docId === 'string' && validDocIds.has(m.docId))
    .map((m: any) => ({
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

/** Load the most recent cached plan for a workspace */
export function loadCachedStudyPlan(workspace: string): StudyPlanResult | null {
  const plans = storageService.getStudyPlans()
  return plans.find(p => p.workspace === workspace) ?? null
}
