import { callAIStream, extractJSON } from '@/services/aiService'
import { recordUsage } from '@/services/tokenUsageService'
import type { ConceptCard } from '@/types'

interface RawConcept {
  conceptName: string
  definition: string
  examples?: string[]
  relatedConcepts?: string[]
  sourceSection?: string
}

export async function extractConcepts(
  docTitle: string,
  docContent: string,
  maxCount: number = 10,
  onChunk?: (text: string) => void,
) {
  // Send as much content as possible — split into 6000-char chunks to stay within token limits
  const CHUNK_SIZE = 6000
  const chunks: string[] = []
  let remaining = docContent
  while (remaining.length > 0) {
    chunks.push(remaining.slice(0, CHUNK_SIZE))
    remaining = remaining.slice(CHUNK_SIZE)
  }
  const contentText = chunks.length > 1
    ? chunks.map((c, i) => `[Section ${i + 1}/${chunks.length}]\n${c}`).join('\n\n---\n\n')
    : docContent.slice(0, CHUNK_SIZE)

  const messages = [
    {
      role: 'system' as const,
      content: `You are a meticulous knowledge extraction assistant. Your job is to extract EVERY notable concept, term, keyword, and named entity from the document. Be exhaustive — do NOT summarize or skip any concept just because it seems "obvious" or "minor".

Extraction rules:
1. Include ALL domain-specific terms, technical keywords, API names, method names, class names, protocol names, file formats, design patterns, algorithms, data structures, and acronyms.
2. Include each variation as a separate concept (e.g. "list", "linked list", "doubly linked list" are separate concepts).
3. Include any parameter, option, flag, or attribute that has specific technical meaning.
4. Include comparison pairs (e.g. "== vs ===", "deep copy vs shallow copy") as separate concepts.
5. Include idioms, conventions, and best practices mentioned in the text.
6. Include numbers, constants, or version-specific details if they carry meaning.
7. If the text defines something explicitly (even in parentheses or asides), extract it.
8. If a term appears in a code example or table, extract it.

Output format — JSON array, as many concepts as you can find:
{"concepts":[{"conceptName":"short name","definition":"1-2 sentence definition based on how the document describes it","examples":["brief example from the text or a common usage"],"relatedConcepts":["other concepts from this document that are related"]}]}
Return ONLY the JSON array. No markdown, no commentary, no "here are the concepts" preamble.`,
    },
    {
      role: 'user' as const,
      content: `Title: ${docTitle}\n\nDocument content:\n${contentText}`,
    },
  ]

  const result = await callAIStream(messages, onChunk)
  if (result.usage) recordUsage('concept', result.usage)
  if (!result.success || !result.data) return result

  try {
    const parsed = extractJSON(result.data)
    const concepts: RawConcept[] = (parsed.concepts || []).slice(0, maxCount)
    result.data = concepts
  } catch (e: any) {
    return { success: false as const, error: e.message }
  }
  return result
}

export function createConceptCard(concept: RawConcept, sourceDocId: string): ConceptCard {
  return {
    id: `concept-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    conceptName: concept.conceptName,
    definition: concept.definition,
    examples: concept.examples || [],
    relatedConcepts: concept.relatedConcepts || [],
    sourceDocId,
    sourceSection: concept.sourceSection,
    createdAt: Date.now(),
    interval: 0,
    repetition: 0,
    efactor: 2.5,
    nextReview: 0,
    lastReview: 0,
  }
}
