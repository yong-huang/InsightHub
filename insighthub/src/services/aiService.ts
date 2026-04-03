const TIMEOUT_MS = 60000
const IDLE_TIMEOUT_MS = 120000 // No data received for 120s = timeout

// Disable reasoning/thinking mode for Qwen3 models to avoid token waste
const NO_THINK_KWARGS = { chat_template_kwargs: { enable_thinking: false } }

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
    const response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        temperature: 0.7,
        max_tokens: 4000,
        ...NO_THINK_KWARGS,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errBody = await response.text().catch(() => '')
      return { success: false, error: `AI 服务返回错误: ${response.status} ${errBody.slice(0, 100)}` }
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content

    if (!content) {
      return { success: false, error: 'AI 服务未返回内容' }
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
): Promise<AIResponse> {
  const controller = new AbortController()

  try {
    const response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        temperature: 0.7,
        max_tokens: 2000,
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
      idleTimer = setTimeout(() => controller.abort(), IDLE_TIMEOUT_MS)
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
            const delta = parsed.choices?.[0]?.delta?.content
            if (delta) {
              content += delta
              resetIdle()
              onChunk?.(content)
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
      return { success: false, error: '生成超时，模型响应过慢，请稍后重试' }
    }
    if (e instanceof TypeError && e.message.includes('fetch')) {
      return { success: false, error: 'AI 服务不可用，请确认本地模型服务已启动' }
    }
    return { success: false, error: `请求失败: ${e.message}` }
  }
}

export function extractJSON(text: string): any {
  // Strip <think>...</think> blocks (Qwen thinking mode)
  let cleaned = text.trim().replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim()

  // If nothing left, the JSON might have been inside the think block — use original
  if (!cleaned) cleaned = text.trim()

  // Strip markdown code fences
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim()
  }

  // Try direct parse first
  try { return JSON.parse(cleaned) } catch {}

  // Find JSON object/array
  const objectMatch = cleaned.match(/\{[\s\S]*\}/)
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/)
  const raw = objectMatch?.[0] || arrayMatch?.[0]

  if (!raw) {
    throw new Error('无法从 AI 响应中提取 JSON')
  }

  try { return JSON.parse(raw) } catch {}

  // Attempt common AI JSON error fixes
  let fixed = raw
  // Remove trailing commas before } or ]
  fixed = fixed.replace(/,\s*([}\]])/g, '$1')
  // Replace Chinese punctuation inside JSON strings that leaked out
  fixed = fixed.replace(/：/g, ':').replace(/，/g, ',').replace(/"/g, '"').replace(/"/g, '"')
  // Remove control characters except newline/tab
  fixed = fixed.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')

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
要求：选择题的正确答案必须均匀分布在 A、B、C、D 四个选项中，不能集中在某一个选项。
只返回 JSON，不要其他文字。
格式：
{"questions":[{"id":"q1","type":"choice","difficulty":"${difficulty}","text":"题目","options":["A选项","B选项","C选项","D选项"],"correctAnswer":"A","explanation":"解析"},{"id":"q2","type":"truefalse","difficulty":"${difficulty}","text":"题目","correctAnswer":"true","explanation":"解析"}]}`,
    },
    {
      role: 'user',
      content: `标题：${documentTitle}\n内容：${truncatedContent}`,
    },
  ]

  const result = await callAIStream(messages)
  if (result.success && result.data) {
    try {
      result.data = extractJSON(result.data)
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  }
  return result
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
