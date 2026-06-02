import { recordUsage } from './tokenUsageService'

const TIMEOUT_MS = 120000
const IDLE_TIMEOUT_MS = 180000 // No data received for 180s = timeout

// Disable reasoning/thinking mode for Qwen3 models to avoid token waste
// - chat_template_kwargs: vLLM / transformers
// - think: Ollama
const NO_THINK_KWARGS = { chat_template_kwargs: { enable_thinking: false }, think: false }

// AI requests go through the Vite dev server proxy at /api/ai/chat/completions
// Server handles AI URL, model, and API key
const PROXY_URL = '/api/ai/chat/completions'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface UsageInfo {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimated?: boolean
}

export interface AIResponse {
  success: boolean
  data?: any
  error?: string
  usage?: UsageInfo
}

export async function callAI(messages: ChatMessage[], timeout = TIMEOUT_MS, maxTokens = 8000): Promise<AIResponse> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const reqBody = {
      messages,
      temperature: 0.7,
      max_tokens: maxTokens,
      ...NO_THINK_KWARGS,
    }
    const response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errBody = await response.text().catch(() => '')
      console.error('[callAI] error body:', errBody.slice(0, 200))
      return { success: false, error: `AI service error: ${response.status} ${errBody.slice(0, 100)}` }
    }

    const data = await response.json()
    const choice = data.choices?.[0]
    let content = choice?.message?.content

    // Warn if output was truncated due to max_tokens limit
    if (choice?.finish_reason === 'length') {
      console.warn('[callAI] output truncated (finish_reason=length). Consider increasing max_tokens.')
    }

    // Fallback: if model used thinking mode and content is empty but reasoning has output,
    // extract any JSON-like content from reasoning as last resort
    if (!content) {
      const reasoning: string | undefined = choice?.message?.reasoning
      if (reasoning) {
        // Try to find JSON in reasoning (some models output JSON inside thinking)
        const jsonMatch = reasoning.match(/\{[\s\S]*"questions"[\s\S]*\}/)
        if (jsonMatch) {
          content = jsonMatch[0]
        } else {
          return { success: false, error: `AI thinking mode consumed all tokens (${data.usage?.completion_tokens || '?'} tokens). No content was generated. Try increasing max_tokens or disabling thinking mode.` }
        }
      } else {
        return { success: false, error: 'AI service returned no content' }
      }
    }

    const u = data.usage
    return {
      success: true,
      data: content,
      usage: u ? {
        promptTokens: u.prompt_tokens || 0,
        completionTokens: u.completion_tokens || 0,
        totalTokens: u.total_tokens || 0,
      } : undefined,
    }
  } catch (e: any) {
    clearTimeout(timeoutId)
    if (e.name === 'AbortError') {
      return { success: false, error: 'Request timed out, please try again later' }
    }
    if (e instanceof TypeError && e.message.includes('fetch')) {
      return { success: false, error: 'AI service unavailable. Please make sure the local model service is running.' }
    }
    return { success: false, error: `Request failed: ${e.message}` }
  }
}

/** Streaming call: reads SSE chunks, accumulates content, idle-timeout between chunks. */
export async function callAIStream(
  messages: ChatMessage[],
  onChunk?: (text: string) => void,
  externalSignal?: AbortSignal,
): Promise<AIResponse> {
  const controller = new AbortController()

  // Link external abort signal so caller can stop the stream
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort()
    } else {
      externalSignal.addEventListener('abort', () => controller.abort(), { once: true })
    }
  }

  // Track whether abort came from idle timeout (internal) vs external signal
  let abortedByTimeout = false
  let content = ''
  let lastUsage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined

  try {
    const response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        temperature: 0.7,
        max_tokens: 4096,
        stream: true,
        ...NO_THINK_KWARGS,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errBody = await response.text().catch(() => '')
      return { success: false, error: `AI service error: ${response.status} ${errBody.slice(0, 100)}` }
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    // Idle timeout: reset every time we receive data
    let idleTimer: ReturnType<typeof setTimeout> = undefined as any
    const resetIdle = () => {
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => { abortedByTimeout = true; controller.abort() }, IDLE_TIMEOUT_MS)
    }
    resetIdle()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data:')) continue
          const payload = trimmed.slice(5).trim()
          if (payload === '[DONE]') continue

          try {
            const parsed = JSON.parse(payload)
            // Capture usage if present in this chunk
            if (parsed.usage) lastUsage = parsed.usage
            const choice = parsed.choices?.[0]
            // Handle thinking mode: extract content from reasoning delta if content is empty
            const delta = choice?.delta?.content || ''
            const reasoningDelta = choice?.delta?.reasoning || ''
            if (delta) {
              content += delta
              resetIdle()
              onChunk?.(content)
            } else if (reasoningDelta) {
              // Model is thinking — accumulate but don't stream to UI
              resetIdle()
            }
          } catch {}
        }
      }
    } finally {
      clearTimeout(idleTimer)
      reader.releaseLock()
    }

    if (!content) {
      return { success: false, error: 'AI service returned no content' }
    }

    let usage: UsageInfo | undefined
    if (lastUsage && lastUsage.total_tokens) {
      usage = {
        promptTokens: lastUsage.prompt_tokens || 0,
        completionTokens: lastUsage.completion_tokens || 0,
        totalTokens: lastUsage.total_tokens || 0,
      }
    } else {
      // Estimate tokens from character count (~1 token per 3 chars for English/Chinese mix)
      const promptChars = messages.reduce((sum, m) => sum + m.content.length, 0)
      const promptTokens = Math.ceil(promptChars / 3)
      const completionTokens = Math.ceil(content.length / 3)
      usage = {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        estimated: true,
      }
    }

    return { success: true, data: content, usage }
  } catch (e: any) {
    if (e.name === 'AbortError') {
      // External abort → treat accumulated content as valid result
      // Timeout abort → report error
      if (externalSignal?.aborted && !abortedByTimeout) {
        // Caller aborted; onChunk has already streamed content to UI.
        // The caller reads streamingText from its own state, so we just signal success.
        if (!content) return { success: true, data: '' }
        const promptChars = messages.reduce((sum, m) => sum + m.content.length, 0)
        const promptTokens = Math.ceil(promptChars / 3)
        const completionTokens = Math.ceil(content.length / 3)
        return {
          success: true, data: '',
          usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens, estimated: true },
        }
      }
      return { success: false, error: 'Generation timed out. The model response was too slow. Please try again later.' }
    }
    if (e instanceof TypeError && e.message.includes('fetch')) {
      return { success: false, error: 'AI service unavailable. Please make sure the local model service is running.' }
    }
    return { success: false, error: `Request failed: ${e.message}` }
  }
}

export function extractJSON(text: string): any {
  // Strip <think...>...</think/> blocks (Qwen thinking mode)
  let cleaned = text.trim().replace(/<think[\s\S]*?<\/think>\s*/g, '').trim()

  // If nothing left, the JSON might have been inside the think block — use original
  if (!cleaned) cleaned = text.trim()

  // Strip markdown code fences — find first opening and last closing fence
  const firstFence = cleaned.indexOf('```')
  if (firstFence !== -1) {
    const afterFirst = cleaned.indexOf('\n', firstFence)
    const lastFence = cleaned.lastIndexOf('```')
    if (lastFence > firstFence && lastFence !== firstFence) {
      cleaned = cleaned.slice(afterFirst + 1, lastFence).trim()
    }
  }

  // Try direct parse first
  try { return JSON.parse(cleaned) } catch {}

  // Find the outermost JSON object by brace-matching (handles truncated output)
  const objStart = cleaned.indexOf('{')
  const arrStart = cleaned.indexOf('[')
  let raw: string | undefined

  if (objStart !== -1 && (arrStart === -1 || objStart < arrStart)) {
    let depth = 0, inStr = false
    for (let i = objStart; i < cleaned.length; i++) {
      const ch = cleaned[i]
      if (inStr) {
        if (ch === '\\') { i++; continue }
        if (ch === '"') inStr = false
        continue
      }
      if (ch === '"') inStr = true
      else if (ch === '{') depth++
      else if (ch === '}') depth--
      if (depth === 0) {
        raw = cleaned.slice(objStart, i + 1)
        break
      }
    }
    // No matching brace — likely truncated, use everything from { onward
    if (!raw) raw = cleaned.slice(objStart)
  } else if (arrStart !== -1) {
    let depth = 0, inStr = false
    for (let i = arrStart; i < cleaned.length; i++) {
      const ch = cleaned[i]
      if (inStr) {
        if (ch === '\\') { i++; continue }
        if (ch === '"') inStr = false
        continue
      }
      if (ch === '"') inStr = true
      else if (ch === '[') depth++
      else if (ch === ']') depth--
      if (depth === 0) {
        raw = cleaned.slice(arrStart, i + 1)
        break
      }
    }
    if (!raw) raw = cleaned.slice(arrStart)
  }

  if (!raw) {
    throw new Error('Failed to extract JSON from AI response')
  }

  // Try to parse as-is
  try { return JSON.parse(raw) } catch {}

  // Repair pipeline: process in a single string-aware pass
  let fixed = raw
  // Remove trailing commas before } or ]
  fixed = fixed.replace(/,\s*([}\]])/g, '$1')
  // Replace Chinese colons/commas that leaked into JSON structure
  fixed = fixed.replace(/：/g, ':').replace(/，/g, ',')

  // String-aware pass: escape literal newlines/controls + track unclosed brackets via stack
  let out = ''
  let inStr = false
  let quoteCount = 0
  const openStack: string[] = []
  for (let i = 0; i < fixed.length; i++) {
    const ch = fixed[i]
    if (inStr) {
      if (ch === '\\') {
        out += ch + (fixed[i + 1] || '')
        i++
      } else if (ch === '"') {
        inStr = false
        quoteCount++
        out += ch
      } else if (ch === '\n' || ch === '\r') {
        out += '\\n'
      } else if (ch.charCodeAt(0) < 0x20) {
        out += '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0')
      } else {
        out += ch
      }
    } else {
      if (ch === '"') {
        inStr = true
        quoteCount++
        out += ch
      } else if (ch === '\u201C' || ch === '\u201D') {
        inStr = true
        quoteCount++
        out += '"'
      } else if (ch === '{' || ch === '[') {
        openStack.push(ch)
        out += ch
      } else if (ch === '}' || ch === ']') {
        const expected = ch === '}' ? '{' : '['
        if (openStack.length > 0 && openStack[openStack.length - 1] === expected) {
          openStack.pop()
        }
        out += ch
      } else {
        out += ch
      }
    }
  }
  fixed = out

  // Close truncated JSON — pop from stack in LIFO order
  if (openStack.length > 0) {
    if (quoteCount % 2 !== 0) fixed += '"'
    while (openStack.length > 0) {
      const opener = openStack.pop()!
      fixed += opener === '{' ? '}' : ']'
    }
  }

  // Insert missing commas between sibling objects/arrays (e.g. }{"id" → },{"id")
  fixed = fixed.replace(/\}\s*\{/g, '},{')
  fixed = fixed.replace(/\]\s*\[/g, '],[')

  try { return JSON.parse(fixed) } catch {}

  throw new Error('Failed to extract JSON from AI response')
}

export async function generateQuizQuestions(
  documentTitle: string,
  documentContent: string,
  difficulty: 'easy' | 'medium' | 'hard',
  count: number,
  enabledTypes?: string[]
): Promise<AIResponse> {
  const difficultyMap = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }

  // Smart truncation: take beginning + evenly spaced samples from the rest to cover whole document
  const MAX_CHARS = 8000
  let truncatedContent: string
  if (documentContent.length <= MAX_CHARS) {
    truncatedContent = documentContent
  } else {
    const headSize = Math.round(MAX_CHARS * 0.5)
    const tailBudget = MAX_CHARS - headSize
    const remaining = documentContent.slice(headSize)
    const sampleCount = 3
    const chunkSize = Math.floor(remaining.length / sampleCount)
    const samples: string[] = []
    for (let i = 0; i < sampleCount; i++) {
      const offset = i * chunkSize + Math.floor(chunkSize * 0.3)
      const end = Math.min(offset + Math.floor(tailBudget / sampleCount), documentContent.length)
      samples.push(documentContent.slice(offset, end))
    }
    truncatedContent = documentContent.slice(0, headSize) + '\n\n---\n\n' + samples.join('\n\n---\n\n')
  }

  // Default distribution if no types specified
  const types = enabledTypes && enabledTypes.length > 0 ? enabledTypes : ['choice', 'truefalse', 'fill_blank', 'short_answer', 'code_completion']

  // Distribute count proportionally across enabled types
  const TYPE_WEIGHTS: Record<string, number> = { choice: 0.4, truefalse: 0.2, fill_blank: 0.2, short_answer: 0.1, code_completion: 0.1 }
  const enabledWeight = types.reduce((sum, t) => sum + (TYPE_WEIGHTS[t] || 0), 0)
  const typeCounts: Record<string, number> = {}
  let allocated = 0
  for (let i = 0; i < types.length; i++) {
    const t = types[i]
    const raw = count * (TYPE_WEIGHTS[t] || 0) / enabledWeight
    const rounded = i < types.length - 1 ? Math.round(raw) : count - allocated
    typeCounts[t] = Math.max(types.length === 1 ? count : 1, rounded)
    allocated += typeCounts[t]
  }

  const typeDescriptions: string[] = []
  if (types.includes('choice')) typeDescriptions.push(`${typeCounts.choice} multiple-choice (type: "choice", with options A-D)`)
  if (types.includes('truefalse')) typeDescriptions.push(`${typeCounts.truefalse} true/false (type: "truefalse", correctAnswer: "true"/"false")`)
  if (types.includes('fill_blank')) typeDescriptions.push(`${typeCounts.fill_blank} fill-in-the-blank (type: "fill_blank", use ___ in text, correctAnswer is the exact word(s) to fill in, include placeholder hint)`)
  if (types.includes('short_answer')) typeDescriptions.push(`${typeCounts.short_answer} short answer (type: "short_answer", correctAnswer is a concise reference answer)`)
  if (types.includes('code_completion')) typeDescriptions.push(`${typeCounts.code_completion} code completion (type: "code_completion", codeSnippet is code with ___ blank, correctAnswer is the code to fill in)`)

  const questionDescription = typeDescriptions.join(', ')
  const actualCount = typeDescriptions.length > 0 ? count : count

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a quiz question generator. Based on the document content, generate ${actualCount} questions: ${questionDescription}. Difficulty: ${difficultyMap[difficulty]}.

Requirements:
1. Correct answers must be accurate. Never sacrifice answer correctness for option distribution balance.
2. For questions involving steps, processes, or sequences, answers must strictly follow the order described in the document.
3. Distribute correct answers across options, but correctness takes priority over distribution.
4. Each question's explanation must explain why the correctAnswer is correct.
5. Questions must not be duplicated or highly similar. Cover different knowledge points from the document.
6. For fill_blank questions: use exactly ___ (three underscores) to mark the blank in the text field. The correctAnswer must be the exact word(s) that fill the blank. Include a placeholder field with a brief hint.
7. For code_completion questions: provide a codeSnippet field containing code with ___ marking the blank. The correctAnswer is the exact code to fill the blank.

Return only JSON, no other text.
Format:
{"questions":[{"id":"q1","type":"choice","difficulty":"${difficulty}","text":"Question text","options":["Option A","Option B","Option C","Option D"],"correctAnswer":"A","explanation":"Explanation"},{"id":"q2","type":"truefalse","difficulty":"${difficulty}","text":"Question text","correctAnswer":"true","explanation":"Explanation"},{"id":"q3","type":"fill_blank","difficulty":"${difficulty}","text":"The ___ is the main component.","correctAnswer":"CPU","placeholder":"a hardware component","explanation":"Explanation"},{"id":"q4","type":"code_completion","difficulty":"${difficulty}","text":"Complete the following code","codeSnippet":"const sum = (a, b) => ___;","correctAnswer":"a + b","explanation":"Explanation"},{"id":"q5","type":"short_answer","difficulty":"${difficulty}","text":"Question text","correctAnswer":"Reference answer","explanation":"Explanation"}]}`,
    },
    {
      role: 'user',
      content: `Title: ${documentTitle}\nContent: ${truncatedContent}`,
    },
  ]

  // Try up to 2 attempts (1 retry on parse failure)
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) {
      console.warn('[generateQuizQuestions] retrying AI call after parse failure...')
    }
    const result = attempt === 0
      ? await callAI(messages, 120000, 16000)
      : await callAI(messages, 120000, 16000)
    if (result.usage) recordUsage('quiz', result.usage)
    if (!result.success || !result.data) {
      return result
    }

    try {
      const parsed = extractJSON(result.data)
      const questions: any[] = (parsed.questions || []).map((q: any, i: number) => ({
        ...q,
        id: `q${i + 1}`,
      }))
      if (questions.length === 0) throw new Error('No questions found in parsed JSON')
      return { success: true, data: { questions } }
    } catch (e: any) {
      console.warn(`[generateQuizQuestions] JSON parse failed (attempt ${attempt + 1}):`, e.message)
      console.warn(`[generateQuizQuestions] raw content (first 500):`, String(result.data).slice(0, 500))

      // On second attempt failure, try regex fallback before giving up
      if (attempt === 1) {
        const text = String(result.data)
        const questionPattern = /\{\s*"id"\s*:\s*"[^"]*"\s*,\s*"type"\s*:\s*"(?:choice|truefalse|fill_blank|short_answer|code_completion)"[\s\S]*?"correctAnswer"[\s\S]*?\}/g
        const matches = text.match(questionPattern)
        if (matches && matches.length > 0) {
          const fallbackQuestions: any[] = []
          for (const m of matches) {
            try {
              const q = JSON.parse(m)
              fallbackQuestions.push(q)
            } catch {}
          }
          if (fallbackQuestions.length > 0) {
            console.warn(`[generateQuizQuestions] fallback: extracted ${fallbackQuestions.length} questions via regex`)
            return { success: true, data: { questions: fallbackQuestions } }
          }
        }
        return { success: false, error: e.message }
      }
      // First attempt failed — retry
    }
  }
  return { success: false, error: 'Failed to generate quiz after retries' }
}

export async function gradeShortAnswers(
  questions: { id: string; text: string; correctAnswer: string }[],
  answers: Record<string, string>
): Promise<AIResponse> {
  const answerPairs = questions.map(q => ({
    id: q.id,
    question: q.text,
    userAnswer: answers[q.id] || '(Not answered)',
    referenceAnswer: q.correctAnswer,
  }))

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a professional grader. Please grade the user's short-answer questions based on the reference answers.

Grading criteria:
- Completely correct or highly accurate: full marks
- Mostly correct with minor omissions: 70-90%
- Partially correct: 40-60%
- Completely wrong or unanswered: 0-20%

Return strict JSON format:
{
  "scores": {
    "questionID": { "score": score, "maxScore": 100, "feedback": "feedback" }
  }
}`,
    },
    {
      role: 'user',
      content: `Please grade the following short-answer questions:\n${JSON.stringify(answerPairs, null, 2)}`,
    },
  ]

  const result = await callAI(messages, 30000)
  if (result.usage) recordUsage('grade', result.usage)
  if (result.success && result.data) {
    try {
      result.data = extractJSON(result.data)
    } catch {
      return { success: false, error: 'Failed to parse AI grading results' }
    }
  }
  return result
}

export async function generateDocumentSummary(
  documentTitle: string,
  documentContent: string,
  sections: { title: string }[],
  onChunk?: (text: string) => void,
): Promise<AIResponse> {
  const truncatedContent = documentContent.slice(0, 6000)
  const sectionList = sections.map(s => s.title).join('\n')

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a document summary assistant. Please generate a structured summary based on the document content, using the following four Markdown section headings:

## Key Points
Summarize 3-5 key points of the document.

## Important Concepts
List the important concepts covered in the document with brief explanations.

## Content Outline
Summarize the main content structure of the document in section order.

## Summary
Summarize the overall content of the document in 2-3 sentences.

Requirements: Keep the content concise and accurate. Output only Markdown text, nothing else.`,
    },
    {
      role: 'user',
      content: `Title: ${documentTitle}\n\nSection list:\n${sectionList}\n\nDocument content:\n${truncatedContent}`,
    },
  ]

  const result = await callAIStream(messages, onChunk)
  if (result.usage) recordUsage('summary', result.usage)
  return result
}

export async function evaluateDocumentAccuracy(
  documentTitle: string,
  documentContent: string,
  onChunk?: (text: string) => void,
): Promise<AIResponse> {
  const truncatedContent = documentContent.slice(0, 6000)

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a rigorous domain expert reviewer. Please evaluate the accuracy of the following document content and output in Markdown format.

Output format requirements:
## Score: X/100
(Provide an integer score based on the accuracy, completeness, and reliability of the content)

## Overall Assessment
(1-2 sentences summarizing the document quality)

## Potential Issues
(List all issues found. Each item should include: the section/topic where the issue is located, a specific description of the problem, and suggested fixes. If no issues are found, state "No obvious issues found.")

## Strengths
(List content that is accurate, reliable, and clearly expressed)

Requirements: Be objective and fair. Output only Markdown text, nothing else.`,
    },
    {
      role: 'user',
      content: `Title: ${documentTitle}\n\nDocument content:\n${truncatedContent}`,
    },
  ]

  const result = await callAIStream(messages, onChunk)
  if (result.usage) recordUsage('evaluation', result.usage)
  return result
}
