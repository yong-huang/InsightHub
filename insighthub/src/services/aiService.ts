import { usePreferenceStore } from '@/stores/preferenceStore'

const TIMEOUT_MS = 60000
const IDLE_TIMEOUT_MS = 120000 // No data received for 120s = timeout

// Disable reasoning/thinking mode for Qwen3 models to avoid token waste
const NO_THINK_KWARGS = { chat_template_kwargs: { enable_thinking: false } }

// Ensure the URL ends with /chat/completions
function resolveApiUrl(baseUrl: string): string {
  const url = baseUrl.replace(/\/+$/, '')
  return url.endsWith('/chat/completions') ? url : `${url}/chat/completions`
}

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
  const { aiApiUrl, aiModel, aiApiKey } = usePreferenceStore.getState()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (aiApiKey) {
      headers['Authorization'] = `Bearer ${aiApiKey}`
    }

    const response = await fetch(resolveApiUrl(aiApiUrl), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: aiModel,
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
async function callAIStream(
  messages: ChatMessage[],
  onChunk?: (text: string) => void,
): Promise<AIResponse> {
  const { aiApiUrl, aiModel, aiApiKey } = usePreferenceStore.getState()
  const controller = new AbortController()

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (aiApiKey) {
      headers['Authorization'] = `Bearer ${aiApiKey}`
    }

    const response = await fetch(resolveApiUrl(aiApiUrl), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: aiModel,
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
  // Strip markdown code fences
  let cleaned = text.trim()
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim()
  }

  // Find JSON object/array
  const objectMatch = cleaned.match(/\{[\s\S]*\}/)
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/)

  try {
    if (objectMatch) return JSON.parse(objectMatch[0])
  } catch {}
  try {
    if (arrayMatch) return JSON.parse(arrayMatch[0])
  } catch {}

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
