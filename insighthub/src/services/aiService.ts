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
      return { success: false, error: `AI 服务返回错误: ${response.status} ${errBody.slice(0, 100)}` }
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
          return { success: false, error: `AI 思考模式占用了全部 token（${data.usage?.completion_tokens || '?'} tokens），未能生成内容。请尝试增加 max_tokens 或禁用思考模式。` }
        }
      } else {
        return { success: false, error: 'AI 服务未返回内容' }
      }
    }

    return { success: true, data: content }
  } catch (e: any) {
    clearTimeout(timeoutId)
    if (e.name === 'AbortError') {
      return { success: false, error: '请求超时，请稍后重试' }
    }
    if (e instanceof TypeError && e.message.includes('fetch')) {
      return { success: false, error: 'AI 服务不可用，请确认本地模型服务已启动' }
    }
    return { success: false, error: `请求失败: ${e.message}` }
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
      return { success: false, error: `AI 服务返回错误: ${response.status} ${errBody.slice(0, 100)}` }
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let content = ''
    let buffer = ''

    // Idle timeout: reset every time we receive data
    let idleTimer: ReturnType<typeof setTimeout>
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
      return { success: false, error: 'AI 服务未返回内容' }
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
      return { success: false, error: '生成超时，模型响应过慢，请稍后重试' }
    }
    if (e instanceof TypeError && e.message.includes('fetch')) {
      return { success: false, error: 'AI 服务不可用，请确认本地模型服务已启动' }
    }
    return { success: false, error: `请求失败: ${e.message}` }
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
    let depth = 0
    for (let i = objStart; i < cleaned.length; i++) {
      if (cleaned[i] === '{') depth++
      else if (cleaned[i] === '}') depth--
      if (depth === 0) {
        raw = cleaned.slice(objStart, i + 1)
        break
      }
    }
    // No matching brace — likely truncated, use everything from { onward
    if (!raw) raw = cleaned.slice(objStart)
  } else if (arrStart !== -1) {
    let depth = 0
    for (let i = arrStart; i < cleaned.length; i++) {
      if (cleaned[i] === '[') depth++
      else if (cleaned[i] === ']') depth--
      if (depth === 0) {
        raw = cleaned.slice(arrStart, i + 1)
        break
      }
    }
    if (!raw) raw = cleaned.slice(arrStart)
  }

  if (!raw) {
    throw new Error('无法从 AI 响应中提取 JSON')
  }

  // Try to parse as-is
  try { return JSON.parse(raw) } catch {}

  // If truncated, attempt to close open brackets/braces
  let repaired = raw
  const opens = (repaired.match(/[[{]/g) || []).length
  const closes = (repaired.match(/[\]}]/g) || []).length
  const missing = opens - closes
  if (missing > 0) {
    // Close a truncated string if mid-quote
    const quoteCount = (repaired.match(/(?<!\\)"/g) || []).length
    if (quoteCount % 2 !== 0) repaired += '"'
    repaired += ']'.repeat(Math.min(missing, 10)) + '}'.repeat(Math.min(missing, 10))
  }

  // Fix common LLM JSON issues by processing inside string literals
  let fixed = repaired
  // Remove trailing commas before } or ]
  fixed = fixed.replace(/,\s*([}\]])/g, '$1')
  // Replace Chinese punctuation that leaked into JSON
  fixed = fixed.replace(/：/g, ':').replace(/，/g, ',').replace(/“/g, '"').replace(/”/g, '"')

  // Escape literal newlines/controls inside JSON string values.
  // LLMs (especially Qwen) frequently output unescaped newlines in explanations.
  let out = ''
  let inStr = false
  for (let i = 0; i < fixed.length; i++) {
    const ch = fixed[i]
    if (inStr) {
      if (ch === '\\') {
        out += ch + (fixed[i + 1] || '')
        i++
      } else if (ch === '"') {
        inStr = false
        out += ch
      } else if (ch === '\n' || ch === '\r') {
        out += '\\n'
      } else if (ch.charCodeAt(0) < 0x20) {
        out += '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0')
      } else {
        out += ch
      }
    } else {
      if (ch === '"') inStr = true
      out += ch
    }
  }
  fixed = out

  try { return JSON.parse(fixed) } catch {}

  throw new Error('无法从 AI 响应中提取 JSON')
}

export async function generateQuizQuestions(
  documentTitle: string,
  documentContent: string,
  difficulty: 'easy' | 'medium' | 'hard',
  count: number
): Promise<AIResponse> {
  const difficultyMap = { easy: '简单', medium: '中等', hard: '困难' }
  const truncatedContent = documentContent.slice(0, 4000)

  const choiceCount = Math.ceil(count * 0.6)
  const tfCount = count - choiceCount

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `你是一个出题助手。根据文档内容生成 ${count} 道题：${choiceCount} 道选择题、${tfCount} 道判断题。难度：${difficultyMap[difficulty]}。
要求：
1. 正确答案必须准确无误，绝对不能为了选项分布而牺牲答案正确性。correctAnswer 指向的选项内容必须与文档事实一致，且与 explanation 逻辑自洽。
2. 建议将正确答案尽量分散在 A、B、C、D 中，但如果某个选项恰好是正确答案，不要为了分布而改变。
3. 每道题的 explanation 必须说明为什么 correctAnswer 是正确的。
4. 题目之间不要重复或高度相似，尽量覆盖文档的不同知识点。
只返回 JSON，不要其他文字。
格式：
{"questions":[{"id":"q1","type":"choice","difficulty":"${difficulty}","text":"题目","options":["A选项","B选项","C选项","D选项"],"correctAnswer":"A","explanation":"解析"},{"id":"q2","type":"truefalse","difficulty":"${difficulty}","text":"题目","correctAnswer":"true","explanation":"解析"}]}`,
    },
    {
      role: 'user',
      content: `标题：${documentTitle}\n内容：${truncatedContent}`,
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
    userAnswer: answers[q.id] || '（未作答）',
    referenceAnswer: q.correctAnswer,
  }))

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `你是一个专业的阅卷助手。请根据参考答案为用户的简答题打分。

评分标准：
- 完全正确或高度准确：满分
- 基本正确但有小遗漏：70-90%
- 部分正确：40-60%
- 完全错误或未作答：0-20%

请返回严格的 JSON 格式：
{
  "scores": {
    "题目ID": { "score": 分数, "maxScore": 100, "feedback": "评语" }
  }
}`,
    },
    {
      role: 'user',
      content: `请为以下简答题打分：\n${JSON.stringify(answerPairs, null, 2)}`,
    },
  ]

  const result = await callAI(messages, 30000)
  if (result.success && result.data) {
    try {
      result.data = extractJSON(result.data)
    } catch {
      return { success: false, error: 'AI 评分结果解析失败' }
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
      content: `你是一个文档摘要助手。请根据文档内容生成结构化摘要，使用以下四个 Markdown 标题段落：

## 核心要点
总结文档的 3-5 个核心要点。

## 重要概念
列出文档中涉及的重要概念并简要解释。

## 内容大纲
按章节顺序概括文档的主要内容结构。

## 总结
用 2-3 句话总结文档的总体内容。

要求：内容简洁准确，使用中文。只输出 Markdown 文本，不要输出其他内容。`,
    },
    {
      role: 'user',
      content: `标题：${documentTitle}\n\n章节列表：\n${sectionList}\n\n文档内容：\n${truncatedContent}`,
    },
  ]

  return callAIStream(messages, onChunk)
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
      content: `你是一位严谨的领域专家审稿人。请对以下文档内容进行准确度评估，使用 Markdown 格式输出。

输出格式要求：
## 评分：X/100
（给出一个整数分数，基于内容的准确性、完整性和可靠性）

## 整体评价
（1-2 句话概括文档质量）

## 可能存在的问题
（列出所有发现的问题，每项包含：问题所在的章节/主题、具体问题描述、建议修改方向。如果没有问题，说明"未发现明显问题"）

## 值得肯定的方面
（列出准确可靠、表述清晰的内容）

要求：内容客观公正，使用中文。只输出 Markdown 文本，不要输出其他内容。`,
    },
    {
      role: 'user',
      content: `标题：${documentTitle}\n\n文档内容：\n${truncatedContent}`,
    },
  ]

  return callAIStream(messages, onChunk)
}
