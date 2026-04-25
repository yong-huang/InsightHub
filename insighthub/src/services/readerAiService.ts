import { callAIStream } from './aiService'
import type { AIResponse } from './aiService'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

/** Multi-turn Q&A with document context */
export async function chatWithDocument(
  docContext: string,
  history: ChatMessage[],
  userMessage: string,
  onChunk?: (text: string) => void,
  signal?: AbortSignal,
): Promise<AIResponse> {
  const truncatedDoc = docContext.slice(0, 6000)

  const systemMsg = {
    role: 'system' as const,
    content: `You are a document reading assistant. Please answer the user's questions based on the document content below. If the question goes beyond the document scope, you may supplement with relevant background knowledge, but clearly indicate which content comes from the document and which is your supplement. Reply in Markdown format, keep it concise and clear.\n\n--- Document Content ---\n${truncatedDoc}`,
  }

  // Keep last 5 turns (10 messages) as conversation context
  const recentHistory = history.slice(-10).map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))

  const messages = [
    systemMsg,
    ...recentHistory,
    { role: 'user' as const, content: userMessage },
  ]

  return callAIStream(messages, onChunk, signal)
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
