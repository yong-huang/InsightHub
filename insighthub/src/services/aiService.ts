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

export interface AIResponse {
  success: boolean
  data?: any
  error?: string
}

async function callAI(messages: ChatMessage[], timeout = TIMEOUT_MS): Promise<AIResponse> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const reqBody = {
      messages,
      temperature: 0.7,
      max_tokens: 4000,
      ...NO_THINK_KWARGS,
    }
    console.log('[callAI] → POST /api/ai/chat/completions', { model: '(server-side)', max_tokens: reqBody.max_tokens, think: reqBody.think, msgCount: messages.length })

    const response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    console.log('[callAI] ← response:', response.status, response.statusText)

    if (!response.ok) {
      const errBody = await response.text().catch(() => '')
      console.error('[callAI] error body:', errBody.slice(0, 200))
      return { success: false, error: `AI service error: ${response.status} ${errBody.slice(0, 100)}` }
    }

    const data = await response.json()
    const choice = data.choices?.[0]
    let content = choice?.message?.content

    console.log('[callAI] choice:', {
      finish_reason: choice?.finish_reason,
      hasContent: !!content,
      contentLen: content?.length || 0,
      hasReasoning: !!choice?.message?.reasoning,
      reasoningLen: choice?.message?.reasoning?.length || 0,
      usage: data.usage,
    })

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

    return { success: true, data: content }
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
    let content = ''
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

    return { success: true, data: content }
  } catch (e: any) {
    if (e.name === 'AbortError') {
      // External abort → treat accumulated content as valid result
      // Timeout abort → report error
      if (externalSignal?.aborted && !abortedByTimeout) {
        // Caller aborted; onChunk has already streamed content to UI.
        // The caller reads streamingText from its own state, so we just signal success.
        return { success: true, data: '' }
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

  // Strip markdown code fences
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim()
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
  // Replace Chinese colons/commas that leaked into JSON structure (NOT Chinese quotes — they break string values)
  fixed = fixed.replace(/：/g, ':').replace(/，/g, ',')

  // String-aware pass: escape literal newlines/controls + count unclosed brackets
  let out = ''
  let inStr = false
  let bracketDepth = 0
  let squareDepth = 0
  let quoteCount = 0
  for (let i = 0; i < fixed.length; i++) {
    const ch = fixed[i]
    if (inStr) {
      if (ch === '\\') {
        out += ch + (fixed[i + 1] || '')
        i++
      } else if (ch === '”') {
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
      if (ch === '”') {
        inStr = true
        quoteCount++
        out += ch
      } else if (ch === '{') { bracketDepth++; out += ch }
      else if (ch === '}') { bracketDepth--; out += ch }
      else if (ch === '[') { squareDepth++; out += ch }
      else if (ch === ']') { squareDepth--; out += ch }
      else {
        out += ch
      }
    }
  }
  fixed = out

  // Close truncated JSON (missing closing brackets/braces)
  const totalMissing = bracketDepth + squareDepth
  if (totalMissing > 0) {
    if (quoteCount % 2 !== 0) fixed += '”'
    fixed += ']'.repeat(squareDepth) + '}'.repeat(bracketDepth)
  }

  // Insert missing commas between sibling objects/arrays (e.g. }{“id” → },{“id”)
  fixed = fixed.replace(/\}\s*\{/g, '},{')
  fixed = fixed.replace(/\]\s*\[/g, '],[')

  try { return JSON.parse(fixed) } catch {}

  throw new Error('Failed to extract JSON from AI response')
}

export async function generateQuizQuestions(
  documentTitle: string,
  documentContent: string,
  difficulty: 'easy' | 'medium' | 'hard',
  count: number
): Promise<AIResponse> {
  const difficultyMap = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }
  const truncatedContent = documentContent.slice(0, 4000)

  const choiceCount = Math.ceil(count * 0.6)
  const tfCount = count - choiceCount

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a quiz question generator. Based on the document content, generate ${count} questions: ${choiceCount} multiple-choice questions and ${tfCount} true/false questions. Difficulty: ${difficultyMap[difficulty]}.
Requirements:
1. Correct answers must be accurate. Never sacrifice answer correctness for option distribution balance. The option pointed to by correctAnswer must match the document facts and be logically consistent with the explanation.
2. For questions involving steps, processes, or sequences (e.g. "what is the first step", "what executes first"), answers must strictly follow the order described in the document. Verify carefully before providing the answer.
3. It is recommended to distribute correct answers across A, B, C, and D, but if a particular option happens to be the correct answer, do not change it for the sake of distribution.
4. Each question's explanation must explain why the correctAnswer is correct.
5. Questions must not be duplicated or highly similar. Cover different knowledge points from the document.
Return only JSON, no other text.
Format:
{"questions":[{"id":"q1","type":"choice","difficulty":"${difficulty}","text":"Question text","options":["Option A","Option B","Option C","Option D"],"correctAnswer":"A","explanation":"Explanation"},{"id":"q2","type":"truefalse","difficulty":"${difficulty}","text":"Question text","correctAnswer":"true","explanation":"Explanation"}]}`,
    },
    {
      role: 'user',
      content: `Title: ${documentTitle}\nContent: ${truncatedContent}`,
    },
  ]

  const result = await callAI(messages)
  console.log('[generateQuizQuestions] result:', { success: result.success, hasData: !!result.data, error: result.error })
  if (!result.success || !result.data) {
    return result
  }

  try {
    const parsed = extractJSON(result.data)
    const questions: any[] = (parsed.questions || []).map((q: any, i: number) => ({
      ...q,
      id: `q${i + 1}`,
    }))
    console.log(`[generateQuizQuestions] got ${questions.length} questions`)
    return { success: true, data: { questions } }
  } catch (e: any) {
    console.warn(`[generateQuizQuestions] JSON parse failed:`, e.message)
    console.warn(`[generateQuizQuestions] raw content (first 500):`, String(result.data).slice(0, 500))
    return { success: false, error: e.message }
  }
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

  return callAIStream(messages, onChunk)
}

export async function generateSpeakerNotes(
  documentTitle: string,
  sections: { title: string; contentHtml: string }[],
  onProgress?: (done: number, total: number) => void,
  externalSignal?: AbortSignal,
): Promise<Record<number, string>> {
  // Strip HTML for each section, truncate to 800 chars
  const stripHtml = (html: string) =>
    html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
  const sectionTexts = sections.map(s => ({
    title: s.title,
    text: stripHtml(s.contentHtml).slice(0, 800),
  }))

  // Build the sections list for the prompt
  const sectionsList = sectionTexts.map((s, i) => `Slide ${i + 1}: ${s.title}\n${s.text}`).join('\n\n---\n\n')

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a professional speech writer responsible for creating conversational speaker notes for presentation slides.

Requirements:
1. Conversational style, as if talking face-to-face with the audience. Do not simply read the document or titles aloud.
2. Each slide's notes should correspond to 2-3 minutes of speaking time (approximately 300-500 words in English).
3. Open with a guiding question or scenario description. Do not directly read the title.
4. Include conversational transitions like "as you can see", "here's a key point", "let's take a look at this".
5. Explain code blocks and technical details in plain language. Do not read code line by line.
6. End with a brief transition sentence to introduce the next slide.
7. Write in English.

Output format (strictly follow this format, separate each slide with a divider):
--- Slide 1: Title ---
Speaker notes content

--- Slide 2: Title ---
Speaker notes content

(And so on, write speaker notes for every slide)

Output only the speaker notes content, no other explanatory text.`,
    },
    {
      role: 'user',
      content: `Document title: ${documentTitle}\n\nBelow are the titles and content summaries for each slide:\n\n${sectionsList}`,
    },
  ]

  const result = await callAIStream(messages, undefined, externalSignal)

  if (!result.success || !result.data) {
    throw new Error(result.error || 'AI service returned no content')
  }

  // Parse the response into Record<number, string>
  const notes: Record<number, string> = {}
  const parts = result.data.split(/---\s*Slide\s+(\d+)\s*[:：]\s*/)

  // parts[0] is any text before the first marker (ignore)
  // Then alternating: title (index 1), content (index 2), title (index 3), content (index 4), ...
  for (let i = 1; i < parts.length; i += 2) {
    const slideNum = parseInt(parts[i], 10)
    const content = (parts[i + 1] || '').trim()
    if (!isNaN(slideNum) && content) {
      notes[slideNum - 1] = content // 0-indexed
    }
  }

  // Report progress as complete
  onProgress?.(sections.length, sections.length)

  return notes
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

  return callAIStream(messages, onChunk)
}
