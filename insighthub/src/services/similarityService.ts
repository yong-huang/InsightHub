import { storageService } from '@/services/storageService'
import { useTagStore } from '@/stores/tagStore'
import { useDocumentStore } from '@/stores/documentStore'

const CACHE_KEY = 'insighthub:similarity-cache'
const TEXT_SNIPPET_LENGTH = 4000
const TOP_K = 10

export interface SimilarityResult {
  docId: string
  score: number
  reasons: string[]
}

// Sparse TF-IDF vector per document
type SparseVector = Map<string, number>

let indexCache: Map<string, SimilarityResult[]> | null = null
let textSnippets: { docId: string; text: string; source: string; category: string; subcategory?: string }[] = []
let similarityBuilt = false

// ---------- English & Chinese stop words ----------
const EN_STOPS = new Set([
  'the','a','an','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','could','should','may','might','shall','can',
  'to','of','in','for','on','with','at','by','from','as','into','through',
  'during','before','after','above','below','between','out','off','over','under',
  'and','but','or','nor','not','no','so','if','then','than','too','very',
  'just','about','up','that','this','these','those','it','its','i','me','my',
  'we','our','you','your','he','him','his','she','her','they','them','their',
  'what','which','who','whom','when','where','why','how','all','each','every',
  'both','few','more','most','other','some','such','only','own','same',
  'also','any','because','there','here','s','t','d','ll','ve','re','m',
])

const ZH_STOPS = new Set(
  '的了是在不了有和人这中大为上个国我以要他时来用们生到作地于出会自一发方成可能都好最然后没之也你说那新什么还他她它我们把被让给从对跟与又很但比更或已然而才而且如果因为所以虽然所以因此但是不过只是这个那个一个没有不是可以就是自己它们或者以及通过其中这些那些之后之前方面以及如何进行相关一些需要使用包括不同其他没有'.split('')
)

function tokenize(text: string): string[] {
  const tokens: string[] = []
  // Split into chunks: run of latin chars or single CJK char
  const re = /[a-zA-Z]+|[\u4e00-\u9fff\u3400-\u4dbf]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const w = m[0]
    if (w.length === 1 && /[\u4e00-\u9fff\u3400-\u4dbf]/.test(w)) {
      // Chinese character — add as unigram
      if (!ZH_STOPS.has(w)) tokens.push(w)
    } else {
      const lower = w.toLowerCase()
      if (lower.length > 1 && !EN_STOPS.has(lower)) tokens.push(lower)
    }
  }
  return tokens
}

function cosineSimilarity(a: SparseVector, b: SparseVector): number {
  let dot = 0
  let normA = 0
  let normB = 0
  // iterate the smaller map
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a]
  for (const [term, val] of smaller) {
    const otherVal = larger.get(term)
    if (otherVal !== undefined) dot += val * otherVal
  }
  for (const v of a.values()) normA += v * v
  for (const v of b.values()) normB += v * v
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

function buildTfIdfVectors(snippets: typeof textSnippets): Map<string, SparseVector> {
  // Build document frequency
  const df = new Map<string, number>()
  for (const s of snippets) {
    const tokens = tokenize(s.text)
    const seen = new Set(tokens)
    for (const t of seen) df.set(t, (df.get(t) || 0) + 1)
  }

  const N = snippets.length
  const vectors = new Map<string, SparseVector>()

  for (const s of snippets) {
    const tokens = tokenize(s.text)
    const tf = new Map<string, number>()
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1)

    const vec = new Map<string, number>()
    for (const [term, count] of tf) {
      const idf = Math.log((N + 1) / ((df.get(term) || 0) + 1)) + 1
      vec.set(term, count * idf)
    }
    vectors.set(s.docId, vec)
  }

  return vectors
}

/** Accumulate text snippets during indexing (call before contentText is freed) */
export function addSnippet(docId: string, text: string, source: string, category: string, subcategory?: string): void {
  if (text.length === 0) return
  textSnippets.push({ docId, text: text.slice(0, TEXT_SNIPPET_LENGTH), source, category, subcategory })
}

/** Build similarity index from accumulated snippets (lazy, runs on first access). */
function buildSimilarityIndex(): void {
  const docs = useDocumentStore.getState().documents
  const tags = useTagStore.getState().tags
  const snippetCount = textSnippets.length

  if (snippetCount === 0) return

  // Try loading cache first — compare doc count
  const cached = storageService._getRaw(CACHE_KEY)
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as { key: string; data: Map<string, SimilarityResult[]> }
      if (parsed.key === `docs:${docs.size}:snippets:${snippetCount}`) {
        indexCache = new Map(Object.entries(parsed.data))
        textSnippets = [] // free memory
        return
      }
    } catch { /* corrupted cache — rebuild */ }
  }
  const vectors = buildTfIdfVectors(textSnippets)

  // Build tag lookup: docId → Set<tagId>
  const docTagMap = new Map<string, Set<string>>()
  for (const tag of tags) {
    for (const did of tag.documentIds) {
      if (!docTagMap.has(did)) docTagMap.set(did, new Set())
      docTagMap.get(did)!.add(tag.id)
    }
  }

  // Group by source for within-source comparison
  const bySource = new Map<string, typeof textSnippets>()
  for (const s of textSnippets) {
    if (!bySource.has(s.source)) bySource.set(s.source, [])
    bySource.get(s.source)!.push(s)
  }

  const results = new Map<string, SimilarityResult[]>()

  for (const [, sourceSnippets] of bySource) {
    for (let i = 0; i < sourceSnippets.length; i++) {
      const a = sourceSnippets[i]
      const vecA = vectors.get(a.docId)
      if (!vecA) continue

      const scores: SimilarityResult[] = []
      for (let j = 0; j < sourceSnippets.length; j++) {
        if (i === j) continue
        const b = sourceSnippets[j]
        const vecB = vectors.get(b.docId)
        if (!vecB) continue

        const sim = cosineSimilarity(vecA, vecB)
        const reasons: string[] = []
        let bonus = 0

        if (a.category === b.category) { bonus += 0.1; reasons.push('Same category') }
        if (a.subcategory && b.subcategory && a.subcategory === b.subcategory) { bonus += 0.15; reasons.push('Same subcategory') }

        // Shared tags
        const tagsA = docTagMap.get(a.docId)
        const tagsB = docTagMap.get(b.docId)
        if (tagsA && tagsB) {
          let shared = 0
          for (const t of tagsA) if (tagsB.has(t)) shared++
          if (shared > 0) {
            bonus += Math.min(shared * 0.05, 0.2)
            reasons.push(`${shared} shared tag${shared > 1 ? 's' : ''}`)
          }
        }

        const finalScore = sim + bonus
        if (finalScore > 0.05) {
          scores.push({ docId: b.docId, score: Math.min(finalScore, 1), reasons })
        }
      }

      scores.sort((x, y) => y.score - x.score)
      results.set(a.docId, scores.slice(0, TOP_K))
    }
  }

  indexCache = results
  textSnippets = [] // free memory
  // (vectors is function-local; it becomes collectible when this function returns)
  // Cache to localStorage
  try {
    const serializable: Record<string, SimilarityResult[]> = {}
    for (const [k, v] of results) serializable[k] = v
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      key: `docs:${docs.size}:snippets:${snippetCount}`,
      data: serializable,
    }))
  } catch {
    // quota exceeded — skip caching
  }
}

/** Lazy guard — builds the index on first call to getSimilarDocuments. */
export function buildIfNeeded(): void {
  if (similarityBuilt || textSnippets.length === 0) return
  similarityBuilt = true
  try {
    buildSimilarityIndex()
  } catch (e) {
    console.error('Failed to build similarity index:', e)
  }
}

/** Reset the build flag (used by clearSimilarityCache on reload). */
function resetBuildFlag(): void {
  similarityBuilt = false
}

/** Get similar documents for a given docId (builds index lazily on first call) */
export function getSimilarDocuments(docId: string, limit = 10): SimilarityResult[] {
  buildIfNeeded()
  if (!indexCache) {
    // Try loading from localStorage
    const cached = storageService._getRaw(CACHE_KEY)
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as { data: Record<string, SimilarityResult[]> }
        indexCache = new Map(Object.entries(parsed.data))
      } catch { return [] }
    }
    if (!indexCache) return []
  }
  return (indexCache.get(docId) || []).slice(0, limit)
}

/** Clear cached index (e.g. on document reload) */
export function clearSimilarityCache(): void {
  indexCache = null
  textSnippets = []
  resetBuildFlag()
  try { localStorage.removeItem(CACHE_KEY) } catch { /* ignore */ }
}
