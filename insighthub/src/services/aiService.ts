import { usePreferenceStore } from '@/stores/preferenceStore'

const TIMEOUT_MS = 60000

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

    const response = await fetch(aiApiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: aiModel,
        messages,
        temperature: 0.7,
        max_tokens: 4000,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      return { success: false, error: `AI 服务返回错误: ${response.status}` }
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
  const truncatedContent = documentContent.slice(0, 8000)

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `你是一个专业的出题助手。请根据提供的文档内容生成 ${count} 道测试题。
要求：
1. 难度级别：${difficultyMap[difficulty]}
2. 题型分布：选择题(${Math.ceil(count * 0.5)}道)、判断题(${Math.ceil(count * 0.2)}道)、简答题(${count - Math.ceil(count * 0.5) - Math.ceil(count * 0.2)}道)
3. 所有题目必须基于文档内容
4. 必须返回严格的 JSON 格式，不要有其他文字说明

JSON 格式如下：
{
  "questions": [
    {
      "id": "q1",
      "type": "choice",
      "difficulty": "${difficulty}",
      "text": "题目内容",
      "options": ["A. 选项1", "B. 选项2", "C. 选项3", "D. 选项4"],
      "correctAnswer": "A",
      "explanation": "答案解析"
    },
    {
      "id": "q2",
      "type": "truefalse",
      "difficulty": "${difficulty}",
      "text": "判断题内容",
      "correctAnswer": "true",
      "explanation": "答案解析"
    },
    {
      "id": "q3",
      "type": "short_answer",
      "difficulty": "${difficulty}",
      "text": "简答题内容",
      "correctAnswer": "参考答案",
      "explanation": "答案解析"
    }
  ]
}`,
    },
    {
      role: 'user',
      content: `文档标题：${documentTitle}\n\n文档内容：\n${truncatedContent}`,
    },
  ]

  const result = await callAI(messages)
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
