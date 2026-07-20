import { recordUsage } from './tokenUsageService'

const PROXY_URL = '/api/ai/chat/completions'
const TIMEOUT_MS = 120000
const IDLE_TIMEOUT_MS = 180000

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

const SYSTEM_PROMPTS: Record<string, string> = {
  describe: `You are describing an image in detail. Provide:
1. A clear overall description of what the image shows
2. Key elements, objects, people, or text visible
3. The context or purpose if identifiable
4. Notable colors, layout, or composition details

Be thorough but concise. Output in the same language as the image content (if text is present), otherwise use the user's likely language. If Chinese text is present, respond in Chinese (中文).`,
  ocr: `You are performing OCR (optical character recognition) on an image. Extract ALL text visible in the image:
1. Preserve the original structure and layout as much as possible
2. If text is in multiple languages, keep each in its original script
3. Include any numbers, symbols, or formulas
4. If text is unclear, mark with [?] and provide your best guess
5. Output plain text, not markdown, unless the image contains formatted content

Output in the language of the text found. If mixed languages, keep each in its original form.`,
  analyze: `You are a technical analyst examining an image. Provide a detailed analysis:
1. Identify what type of image this is (diagram, chart, screenshot, photo, illustration, etc.)
2. If it's a diagram or chart: describe the data flow, architecture, relationships, or trends
3. If it contains code: identify the language, describe the logic, and point out any issues
4. If it's a UI screenshot: evaluate the design, layout, and user experience
5. If it contains technical notation: explain the concepts and relationships
6. Highlight any interesting or notable aspects

Be thorough and technical. Output in Chinese (中文) unless the image content is clearly English-only.`,
}

const VISION_NOT_CONFIGURED = 'Vision model not configured. Go to Settings → AI Model → Vision to set one up.'

export async function checkVisionConfigured(): Promise<boolean> {
  try {
    const res = await fetch('/api/ai/config')
    if (!res.ok) return false
    const cfg = await res.json() as { visionProfileId?: string }
    return !!cfg.visionProfileId
  } catch {
    return false
  }
}

export async function analyzeImage(
  imageSrc: string,
  mode: 'describe' | 'ocr' | 'analyze',
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<{ usage?: UsageInfo }> {
  // Pre-flight: check if vision profile is configured
  const visionOk = await checkVisionConfigured()
  if (!visionOk) {
    throw new Error(VISION_NOT_CONFIGURED)
  }

  // Fetch image and convert to base64 data URL
  let imageDataUrl: string
  try {
    const response = await fetch(imageSrc)
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`)
    const blob = await response.blob()
    imageDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('Failed to read image'))
      reader.readAsDataURL(blob)
    })
  } catch (e) {
    throw new Error(`Image fetch failed: ${(e as Error).message}`)
  }

  const systemPrompt = SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.describe

  const userContent: VisionContent[] = [
    { type: 'text', text: mode === 'ocr' ? 'Extract all text from this image.' : 'Analyze this image.' },
    { type: 'image_url', image_url: { url: imageDataUrl } },
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
        purpose: 'vision',
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

  if (usage) recordUsage('image-analysis', usage)
  return { usage }
}

export async function chatAboutImage(
  imageDataUrl: string,
  analysisText: string,
  chatMessages: { role: 'user' | 'assistant'; content: string }[],
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<{ usage?: UsageInfo }> {
  // Pre-flight: check if vision profile is configured
  const visionOk = await checkVisionConfigured()
  if (!visionOk) {
    throw new Error(VISION_NOT_CONFIGURED)
  }

  const messages: VisionMessage[] = [
    {
      role: 'system',
      content: `You are an assistant that answers questions about an image. The image analysis is provided below for context. Answer in the same language as the user's question.\n\n## Image Analysis\n${analysisText}`,
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Based on the image analysis above, answer the following question.' },
        { type: 'image_url', image_url: { url: imageDataUrl } },
      ],
    },
    ...chatMessages.map(m => ({ role: m.role, content: m.content })),
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
        purpose: 'vision',
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

  if (usage) recordUsage('image-analysis', usage)
  return { usage }
}
