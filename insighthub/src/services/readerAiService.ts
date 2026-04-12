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
    content: `你是一个文档阅读助手。请基于以下文档内容回答用户的问题。如果问题超出文档范围，可以补充相关背景知识，但要明确标注哪些内容来自文档、哪些是你的补充。使用 Markdown 格式回复，保持简洁清晰。\n\n--- 文档内容 ---\n${truncatedDoc}`,
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
      content: '你是一个知识解释助手。用户会给你一段选中的文本及其上下文。如果是术语，请给出定义和背景知识；如果是段落，请概括核心含义。回答控制在 200 字以内，使用 Markdown 格式，简洁清晰。',
    },
    {
      role: 'user' as const,
      content: `选中文本：${selectedText}\n\n上下文：${context}`,
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
      content: '你是一个翻译助手。自动检测语言：如果是中文则翻译为英文，如果是英文则翻译为中文。只输出翻译结果，不要输出其他内容。',
    },
    {
      role: 'user' as const,
      content: selectedText,
    },
  ]

  return callAIStream(messages, onChunk)
}
