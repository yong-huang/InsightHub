import { recordUsage } from './tokenUsageService'

const PROXY_URL = '/api/ai/chat/completions'
const TIMEOUT_MS = 120000
const IDLE_TIMEOUT_MS = 180000 // No data for 180s = timeout

interface UsageInfo {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimated?: boolean
}

interface VisionContent {
  type: 'text' | 'image_url'
  text?: string
  image_url?: { url: string }
}

interface VisionMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | VisionContent[]
}

export async function analyzeWhiteboard(
  canvasDataUrl: string,
  mode: 'analyze' | 'interview',
  docContext: string,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<{ usage?: UsageInfo }> {
  const systemPrompt = mode === 'interview'
    ? `You are conducting a mock technical interview. The candidate has been sketching their thoughts, pseudocode, and diagrams on a whiteboard. Analyze their whiteboard content and:
1. Identify what problem or concept they are working on
2. Evaluate the correctness and quality of their approach
3. Provide constructive feedback with specific suggestions
4. Ask 1-2 follow-up questions to probe their understanding deeper
5. If you spot bugs or logical errors, point them out gently

Respond in a conversational interview style. Be encouraging but thorough. Output in Chinese (中文).`
    : `You are a technical reviewer analyzing a whiteboard sketch. The user is studying a technical document and sketching notes on this whiteboard. Analyze the content and:
1. Summarize what the user has been drawing/noting
2. Identify any errors in the logic, pseudocode, or diagrams
3. Suggest improvements or missing elements
4. Connect the whiteboard content to relevant technical concepts

Be concise but thorough. Output in Chinese (中文).`

  const userContent: VisionContent[] = [
    { type: 'text', text: docContext ? `Document context (for reference):\n${docContext}\n\nAnalyze the whiteboard content above.` : 'Analyze this whiteboard content.' },
    { type: 'image_url', image_url: { url: canvasDataUrl } },
  ]

  const messages: VisionMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent },
  ]

  const controller = new AbortController()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let fullText = ''
  let usage: UsageInfo | undefined
  let idleTimer: ReturnType<typeof setTimeout> | undefined = undefined

  try {
    const response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        temperature: 0.7,
        max_tokens: 4096,
        stream: true,
        chat_template_kwargs: { enable_thinking: false },
        think: false,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errBody = await response.text().catch(() => '')
      throw new Error(`AI error: ${response.status} ${errBody.slice(0, 100)}`)
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    // Idle timeout: reset on every data received
    const resetIdle = () => {
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => controller.abort(), IDLE_TIMEOUT_MS)
    }
    resetIdle()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      resetIdle()
      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6)
        if (data === '[DONE]') continue
        try {
          const parsed = JSON.parse(data)
          const delta = parsed.choices?.[0]?.delta?.content
          if (delta) {
            fullText += delta
            onChunk(fullText)
          }
          if (parsed.usage) {
            usage = {
              promptTokens: parsed.usage.prompt_tokens || 0,
              completionTokens: parsed.usage.completion_tokens || 0,
              totalTokens: parsed.usage.total_tokens || 0,
            }
          }
        } catch { /* skip malformed chunks */ }
      }
    }
  } finally {
    clearTimeout(timeoutId)
    clearTimeout(idleTimer)
  }

  if (usage) recordUsage('whiteboard', usage)
  return { usage }
}
