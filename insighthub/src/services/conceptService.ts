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
  const truncatedContent = docContent.slice(0, 6000)

  const messages = [
    {
      role: 'system' as const,
      content: `You are a knowledge extraction assistant. Extract up to ${maxCount} core concepts from the document. Each concept should include a name, definition, examples, and related concepts.
Return only JSON, no other text.
Format:
{"concepts":[{"conceptName":"Concept Name","definition":"Definition","examples":["Example 1"],"relatedConcepts":["Related Concept 1"],"sourceSection":"Source Section"}]}`,
    },
    {
      role: 'user' as const,
      content: `Title: ${docTitle}\n\nDocument content:\n${truncatedContent}`,
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
