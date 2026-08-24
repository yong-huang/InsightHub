import { callAIStream, extractJSON } from '@/services/aiService'
import { recordUsage } from '@/services/tokenUsageService'

export async function extractTopics(
  docTitle: string,
  docContent: string,
): Promise<{ success: boolean; topics?: string[]; error?: string }> {
  const truncatedContent = docContent.slice(0, 4000)

  const messages = [
    {
      role: 'system' as const,
      content: `You are a topic extraction assistant. Extract 3-5 key topics from the document that would be useful for finding architecture diagrams, system design illustrations, or technical diagrams.
Return only JSON, no other text.
Format: {"topics":["Topic 1","Topic 2","Topic 3"]}`,
    },
    {
      role: 'user' as const,
      content: `Title: ${docTitle}\n\nDocument content:\n${truncatedContent}`,
    },
  ]

  try {
    const result = await callAIStream(messages)
    if (result.usage) recordUsage('diagram-topic', result.usage)
    if (!result.success || !result.data) {
      return { success: false, error: result.error || 'AI call failed' }
    }

    const parsed = extractJSON(String(result.data)) as { topics?: string[] }
    const topics: string[] = (parsed.topics || []).slice(0, 5)
    if (topics.length === 0) {
      return { success: false, error: 'No topics extracted' }
    }
    return { success: true, topics }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export interface SearchImageResult {
  url: string
  thumbnail: string
  title: string
  source: string
  sourceUrl?: string
}

export interface SearchImagesResponse {
  success: boolean
  results?: SearchImageResult[]
  error?: string
}

export async function searchDiagramImages(
  query: string,
  engine: 'google' | 'bing',
  page = 0,
): Promise<SearchImagesResponse> {
  try {
    const res = await fetch('/api/search-images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, engine, page }),
    })
    const data = await res.json()
    return data as SearchImagesResponse
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}
