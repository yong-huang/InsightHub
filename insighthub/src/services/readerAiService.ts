import { callAIStream, callAI, extractJSON } from './aiService'
import type { AIResponse } from './aiService'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export type ChatContextMode = 'full' | 'section' | 'selection'

/** Multi-turn Q&A with document context */
export async function chatWithDocument(
  docContext: string,
  history: ChatMessage[],
  userMessage: string,
  onChunk?: (text: string) => void,
  signal?: AbortSignal,
  contextMode: ChatContextMode = 'full',
): Promise<AIResponse> {
  const truncatedDoc = docContext.slice(0, 6000)

  let systemPrompt: string
  if (contextMode === 'selection') {
    systemPrompt = `You are a Socratic tutor. The user has selected a specific passage from the document and is asking about it. Help them understand the selection deeply by:
- Explaining concepts clearly and simply
- Asking probing follow-up questions to check understanding
- Connecting the selected text to broader themes in the document
- Pointing out nuances or implications they might have missed
Reply in Markdown format, keep it concise and clear.

--- Selected Document Content ---
${truncatedDoc}`
  } else if (contextMode === 'section') {
    systemPrompt = `You are a Socratic tutor. The user is reading a specific section of the document. Help them learn from this section by:
- Answering questions about the current section's content
- Explaining key concepts in the section
- Drawing connections to other parts of the document
- Asking thought-provoking questions to deepen understanding
Reply in Markdown format, keep it concise and clear.

--- Current Section Content ---
${truncatedDoc}`
  } else {
    systemPrompt = `You are a document reading assistant. Please answer the user's questions based on the document content below. If the question goes beyond the document scope, you may supplement with relevant background knowledge, but clearly indicate which content comes from the document and which is your supplement. Reply in Markdown format, keep it concise and clear.

--- Document Content ---
${truncatedDoc}`
  }

  // Keep last 5 turns (10 messages) as conversation context
  const recentHistory = history.slice(-10).map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    ...recentHistory,
    { role: 'user' as const, content: userMessage },
  ]

  return callAIStream(messages, onChunk, signal)
}

/** Generate follow-up suggestion questions after an AI response */
export async function generateFollowUpSuggestions(
  docContext: string,
  lastQuestion: string,
  lastAnswer: string,
  _signal?: AbortSignal,
): Promise<string[]> {
  const truncatedDoc = docContext.slice(0, 3000)

  const messages = [
    {
      role: 'system' as const,
      content: `Based on the document and the Q&A conversation, suggest 3 follow-up questions the user might want to ask next. These should help deepen understanding of the topic discussed. Return only a JSON array of strings, no other text. Each question should be concise (under 15 words).`,
    },
    {
      role: 'user' as const,
      content: `Document snippet: ${truncatedDoc}\n\nUser asked: ${lastQuestion}\n\nAI answered: ${lastAnswer.slice(0, 500)}`,
    },
  ]

  const result = await callAI(messages, 15000)
  if (!result.success || !result.data) return []

  try {
    const parsed = extractJSON(result.data)
    if (Array.isArray(parsed)) {
      return parsed.slice(0, 3).map((s: any) => String(s)).filter(s => s.length > 0 && s.length < 100)
    }
    return []
  } catch {
    return []
  }
}

/** Explain a concept from selected text */
export async function explainConcept(
  selectedText: string,
  surroundingText: string,
  onChunk?: (text: string) => void,
): Promise<AIResponse> {
  const context = surroundingText.slice(0, 1000)

  const messages = [
    {
      role: 'system' as const,
      content: 'You are a knowledge explanation assistant. The user will give you a selected text and its context. If it is a term, provide the definition and background knowledge; if it is a paragraph, summarize the core meaning. Keep the answer within 200 words, use Markdown format, be concise and clear.',
    },
    {
      role: 'user' as const,
      content: `Selected text: ${selectedText}\n\nContext: ${context}`,
    },
  ]

  return callAIStream(messages, onChunk)
}

/** Translate selected text (auto-detect language) */
export async function translateText(
  selectedText: string,
  onChunk?: (text: string) => void,
): Promise<AIResponse> {
  const messages = [
    {
      role: 'system' as const,
      content: 'You are a translation assistant. Auto-detect the language: if Chinese, translate to English; if English, translate to Chinese. Output only the translation result, nothing else.',
    },
    {
      role: 'user' as const,
      content: selectedText,
    },
  ]

  return callAIStream(messages, onChunk)
}
