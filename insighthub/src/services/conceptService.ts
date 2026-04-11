import { callAIStream, extractJSON } from '@/services/aiService'
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
      content: `你是一个知识提取助手。从文档中提取最多 ${maxCount} 个核心概念，每个概念包括名称、定义、示例、相关概念。
只返回 JSON，不要其他文字。
格式：
{"concepts":[{"conceptName":"概念名","definition":"定义","examples":["示例1"],"relatedConcepts":["相关概念1"],"sourceSection":"所在章节"}]}`,
    },
    {
      role: 'user' as const,
      content: `标题：${docTitle}\n\n文档内容：\n${truncatedContent}`,
    },
  ]

  const result = await callAIStream(messages, onChunk)
  if (!result.success || !result.data) return result

  try {
    const parsed = extractJSON(result.data)
    const concepts: RawConcept[] = parsed.concepts || []
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
