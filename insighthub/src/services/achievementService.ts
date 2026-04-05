import { storageService } from '@/services/storageService'
import { useDocumentStore } from '@/stores/documentStore'
import { useQuizStore } from '@/stores/quizStore'
import { useAnnotationStore } from '@/stores/annotationStore'
import { useTagStore } from '@/stores/tagStore'
import { CATEGORIES } from '@/utils/categoryMap'

export interface Achievement {
  id: string
  name: string
  description: string
  icon: string // lucide icon name
  color: string // CSS var name
  category: 'reading' | 'quiz' | 'annotation' | 'streak' | 'special'
}

export interface AchievementState {
  unlockedIds: string[]
  unlockedAt: Record<string, number> // id → timestamp
}

export interface Metrics {
  // Reading
  readCount: number
  totalWords: number
  readCategoryKeys: Set<string>
  hasMindInsight: boolean
  hasTechInsight: boolean
  // Quiz
  quizCount: number
  hasPerfectScore: boolean
  consecutiveHighScores: number // consecutive quizzes >= 90%
  difficulties: Set<string>
  totalQuizQuestions: number
  // Annotation
  totalAnnotations: number
  hasHighlight: boolean
  hasComment: boolean
  highlightColors: Set<string>
  totalReplies: number
  // Search & Tags
  searchCount: number
  tagCount: number
  // Streak / time
  currentStreak: number
  readHourSet: Set<number> // hours (0-23) with reading records
  readDaySet: Set<string> // "YYYY-M-D" strings
  // Extras
  readLaterCount: number
  summaryCount: number
}

export const ACHIEVEMENTS: Achievement[] = [
  // Reading
  { id: 'first-read', name: '初次阅读', description: '标记第一篇文档为已读', icon: 'BookOpen', color: '--accent-blue', category: 'reading' },
  { id: 'reader-10', name: '博览群书', description: '阅读 10 篇文档', icon: 'BookOpen', color: '--accent-blue', category: 'reading' },
  { id: 'reader-50', name: '书虫', description: '阅读 50 篇文档', icon: 'BookOpen', color: '--accent-blue', category: 'reading' },
  { id: 'reader-100', name: '阅读大师', description: '阅读 100 篇文档', icon: 'BookOpen', color: '--accent-purple', category: 'reading' },
  { id: 'word-10k', name: '万卷书', description: '累计阅读 1 万字', icon: 'FileText', color: '--accent-purple', category: 'reading' },
  { id: 'word-100k', name: '学富五车', description: '累计阅读 10 万字', icon: 'FileText', color: '--accent-purple', category: 'reading' },
  { id: 'word-500k', name: '博学多才', description: '累计阅读 50 万字', icon: 'FileText', color: '--accent-green', category: 'reading' },
  { id: 'category-master', name: '全能学者', description: '所有分类至少读一篇', icon: 'GraduationCap', color: '--accent-green', category: 'reading' },
  { id: 'deep-reader', name: '深度阅读', description: '阅读 3 篇万字以上的长文', icon: 'Library', color: '--accent-blue', category: 'reading' },

  // Quiz
  { id: 'first-quiz', name: '初次测验', description: '完成第一次测验', icon: 'BrainCircuit', color: '--accent-purple', category: 'quiz' },
  { id: 'quiz-10', name: '测验达人', description: '完成 10 次测验', icon: 'BrainCircuit', color: '--accent-purple', category: 'quiz' },
  { id: 'quiz-50', name: '题海战术', description: '完成 50 次测验', icon: 'BrainCircuit', color: '--accent-red', category: 'quiz' },
  { id: 'perfect-score', name: '满分通过', description: '测验获得满分 (100%)', icon: 'Sparkles', color: '--accent-yellow', category: 'quiz' },
  { id: 'high-scorer', name: '高分选手', description: '连续 3 次测验 ≥90 分', icon: 'Trophy', color: '--accent-yellow', category: 'quiz' },
  { id: 'quiz-all-difficulty', name: '全面挑战', description: '在三种难度下各完成一次测验', icon: 'Target', color: '--accent-orange', category: 'quiz' },
  { id: 'quiz-machine', name: '答题机器', description: '累计答题 100 道', icon: 'Zap', color: '--accent-orange', category: 'quiz' },
  { id: 'perfectionist', name: '完美主义', description: '累计 5 次满分测验', icon: 'Crown', color: '--accent-yellow', category: 'quiz' },

  // Annotation
  { id: 'first-highlight', name: '初次标注', description: '创建第一条高亮', icon: 'Highlighter', color: '--accent-green', category: 'annotation' },
  { id: 'first-comment', name: '初次评论', description: '创建第一条评论批注', icon: 'MessageSquare', color: '--accent-green', category: 'annotation' },
  { id: 'annotation-50', name: '批注达人', description: '累计 50 条批注', icon: 'MessageSquare', color: '--accent-green', category: 'annotation' },
  { id: 'annotation-100', name: '批注专家', description: '累计 100 条批注', icon: 'MessageSquare', color: '--accent-purple', category: 'annotation' },
  { id: 'rainbow', name: '色彩大师', description: '使用全部 6 种高亮颜色', icon: 'Palette', color: '--accent-purple', category: 'annotation' },
  { id: 'first-reply', name: '互动达人', description: '为批注添加第一条回复', icon: 'Reply', color: '--accent-blue', category: 'annotation' },
  { id: 'reply-10', name: '活跃讨论', description: '累计 10 条回复', icon: 'MessagesSquare', color: '--accent-blue', category: 'annotation' },

  // Streak & Explore
  { id: 'streak-3', name: '连续三天', description: '连续 3 天有阅读记录', icon: 'Flame', color: '--accent-orange', category: 'streak' },
  { id: 'streak-7', name: '一周坚持', description: '连续 7 天有阅读记录', icon: 'Flame', color: '--accent-orange', category: 'streak' },
  { id: 'streak-30', name: '月度打卡', description: '连续 30 天有阅读记录', icon: 'Flame', color: '--accent-red', category: 'streak' },
  { id: 'explorer', name: '探索者', description: '同时探索两个来源 (MindInsight + TechInsight)', icon: 'Compass', color: '--accent-blue', category: 'streak' },
  { id: 'searcher', name: '搜索达人', description: '累计搜索 20 次', icon: 'Search', color: '--accent-blue', category: 'streak' },
  { id: 'tagger', name: '标签整理', description: '创建 10 个标签', icon: 'Tag', color: '--accent-green', category: 'streak' },
  { id: 'bookmarker', name: '稍后阅读', description: '收藏 5 篇文档到稍后阅读', icon: 'Bookmark', color: '--accent-orange', category: 'streak' },

  // Special
  { id: 'night-owl', name: '夜猫子', description: '在 0:00-6:00 之间有阅读记录', icon: 'Moon', color: '--accent-purple', category: 'special' },
  { id: 'early-bird', name: '早起鸟', description: '在 5:00-8:00 之间有阅读记录', icon: 'Sun', color: '--accent-yellow', category: 'special' },
  { id: 'all-day-reader', name: '全天候', description: '在三个不同时段 (早/午/晚) 都有阅读记录', icon: 'Clock', color: '--accent-purple', category: 'special' },
  { id: 'weekend-reader', name: '周末充电', description: '在周末有阅读记录', icon: 'Calendar', color: '--accent-blue', category: 'special' },
  { id: 'speed-reader', name: '速读挑战', description: '一天内阅读 5 篇文档', icon: 'Timer', color: '--accent-orange', category: 'special' },
  { id: 'ai-summary', name: 'AI 助手', description: '生成第一篇 AI 摘要', icon: 'Bot', color: '--accent-green', category: 'special' },
]

function computeStreak(readHistory: { readAt: number }[]): number {
  if (readHistory.length === 0) return 0

  const daySet = new Set<string>()
  for (const entry of readHistory) {
    const d = new Date(entry.readAt)
    daySet.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`)
  }

  const today = new Date()
  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`

  let streak = 0
  const checkDate = new Date(today)

  // If today has no record, start from yesterday
  if (!daySet.has(todayKey)) {
    checkDate.setDate(checkDate.getDate() - 1)
  }

  while (true) {
    const key = `${checkDate.getFullYear()}-${checkDate.getMonth()}-${checkDate.getDate()}`
    if (daySet.has(key)) {
      streak++
      checkDate.setDate(checkDate.getDate() - 1)
    } else {
      break
    }
  }

  return streak
}

export function collectMetrics(): Metrics {
  const documents = useDocumentStore.getState().documents
  const quizHistory = useQuizStore.getState().quizHistory
  const annotations = useAnnotationStore.getState().annotations
  const readHistory = storageService.getReadHistory()

  // Reading metrics
  const readDocs = Array.from(documents.values()).filter(d => d.isRead)
  const readCount = readDocs.length
  const totalWords = readDocs.reduce((s, d) => s + d.wordCount, 0)
  const readCategoryKeys = new Set(readDocs.map(d => d.category))
  const hasMindInsight = readDocs.some(d => d.source === 'mindinsight')
  const hasTechInsight = readDocs.some(d => d.source === 'techinsight')
  const longDocCount = readDocs.filter(d => d.wordCount >= 10000).length

  // Quiz metrics
  const quizCount = quizHistory.length
  const hasPerfectScore = quizHistory.some(
    a => a.totalScore > 0 && a.totalScore === a.maxScore
  )
  const perfectScoreCount = quizHistory.filter(
    a => a.totalScore > 0 && a.totalScore === a.maxScore
  ).length
  let consecutiveHighScores = 0
  for (let i = 0; i < quizHistory.length; i++) {
    const a = quizHistory[i]
    if (a.maxScore > 0 && (a.totalScore / a.maxScore) >= 0.9) {
      consecutiveHighScores++
    } else {
      break
    }
  }

  const difficulties = new Set<string>()
  const quizzes = storageService.getQuizzes()
  let totalQuizQuestions = 0
  for (const attempt of quizHistory) {
    const quiz = quizzes[attempt.documentId]
    if (quiz?.questions?.length) {
      difficulties.add(quiz.questions[0].difficulty || 'medium')
      totalQuizQuestions += quiz.questions.length
    }
  }

  // Annotation metrics
  const totalAnnotations = annotations.length
  const hasHighlight = annotations.some(a => a.type === 'highlight')
  const hasComment = annotations.some(a => a.type === 'comment')
  const highlightColors = new Set<string>()
  let totalReplies = 0
  for (const a of annotations) {
    if (a.type === 'highlight' && a.color) {
      highlightColors.add(a.color)
    }
    totalReplies += a.replies?.length ?? 0
  }
  const hasReply = totalReplies > 0

  // Search & Tags
  const searchHistory = storageService.getSearchHistory()
  const searchCount = searchHistory.length
  const { tags } = useTagStore.getState() as { tags: { id: string }[] }
  const tagCount = tags.length

  // Streak & time metrics
  const currentStreak = computeStreak(readHistory)
  const readHourSet = new Set<number>()
  const readDaySet = new Set<string>()
  for (const entry of readHistory) {
    const d = new Date(entry.readAt)
    readHourSet.add(d.getHours())
    readDaySet.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`)
  }

  // Extras
  const readLaterCount = storageService.getReadLaterList().length
  const summaryCount = Object.keys(storageService.getSummaries()).length

  return {
    readCount, totalWords, readCategoryKeys, hasMindInsight, hasTechInsight,
    quizCount, hasPerfectScore, consecutiveHighScores, difficulties, totalQuizQuestions, perfectScoreCount,
    totalAnnotations, hasHighlight, hasComment, highlightColors, totalReplies, hasReply,
    searchCount, tagCount,
    currentStreak, readHourSet, readDaySet,
    readLaterCount, summaryCount,
    longDocCount,
  }
}

function checkCondition(achievement: Achievement, metrics: Metrics): boolean {
  switch (achievement.id) {
    // Reading
    case 'first-read': return metrics.readCount >= 1
    case 'reader-10': return metrics.readCount >= 10
    case 'reader-50': return metrics.readCount >= 50
    case 'reader-100': return metrics.readCount >= 100
    case 'word-10k': return metrics.totalWords >= 10000
    case 'word-100k': return metrics.totalWords >= 100000
    case 'word-500k': return metrics.totalWords >= 500000
    case 'category-master': {
      const allCategoryKeys = new Set(CATEGORIES.map(c => c.key))
      for (const key of allCategoryKeys) {
        if (!metrics.readCategoryKeys.has(key)) return false
      }
      return true
    }
    case 'deep-reader': return metrics.longDocCount >= 3
    // Quiz
    case 'first-quiz': return metrics.quizCount >= 1
    case 'quiz-10': return metrics.quizCount >= 10
    case 'quiz-50': return metrics.quizCount >= 50
    case 'perfect-score': return metrics.hasPerfectScore
    case 'high-scorer': return metrics.consecutiveHighScores >= 3
    case 'quiz-all-difficulty':
      return metrics.difficulties.has('easy') && metrics.difficulties.has('medium') && metrics.difficulties.has('hard')
    case 'quiz-machine': return metrics.totalQuizQuestions >= 100
    case 'perfectionist': return (metrics as Record<string, number>).perfectScoreCount >= 5
    // Annotation
    case 'first-highlight': return metrics.hasHighlight
    case 'first-comment': return metrics.hasComment
    case 'annotation-50': return metrics.totalAnnotations >= 50
    case 'annotation-100': return metrics.totalAnnotations >= 100
    case 'rainbow': return metrics.highlightColors.size >= 6
    case 'first-reply': return metrics.hasReply
    case 'reply-10': return metrics.totalReplies >= 10
    // Streak
    case 'streak-3': return metrics.currentStreak >= 3
    case 'streak-7': return metrics.currentStreak >= 7
    case 'streak-30': return metrics.currentStreak >= 30
    case 'explorer': return metrics.hasMindInsight && metrics.hasTechInsight
    case 'searcher': return metrics.searchCount >= 20
    case 'tagger': return metrics.tagCount >= 10
    case 'bookmarker': return metrics.readLaterCount >= 5
    // Special
    case 'night-owl': {
      for (const h of metrics.readHourSet) {
        if (h >= 0 && h < 6) return true
      }
      return false
    }
    case 'early-bird': {
      for (const h of metrics.readHourSet) {
        if (h >= 5 && h < 8) return true
      }
      return false
    }
    case 'all-day-reader': {
      const hasMorning = Array.from(metrics.readHourSet).some(h => h >= 5 && h < 12)
      const hasAfternoon = Array.from(metrics.readHourSet).some(h => h >= 12 && h < 18)
      const hasEvening = Array.from(metrics.readHourSet).some(h => h >= 18 || h < 1)
      return hasMorning && hasAfternoon && hasEvening
    }
    case 'weekend-reader': {
      for (const dayStr of metrics.readDaySet) {
        const parts = dayStr.split('-')
        const d = new Date(+parts[0], +parts[1], +parts[2])
        const day = d.getDay()
        if (day === 0 || day === 6) return true
      }
      return false
    }
    case 'speed-reader': {
      const today = new Date()
      const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`
      let todayCount = 0
      for (const entry of storageService.getReadHistory()) {
        const d = new Date(entry.readAt)
        const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
        if (key === todayKey) todayCount++
      }
      return todayCount >= 5
    }
    case 'ai-summary': return metrics.summaryCount >= 1
    default: return false
  }
}

// Get progress info for number-based achievements
export function getAchievementProgress(achievement: Achievement, metrics: Metrics): { current: number; target: number } | null {
  switch (achievement.id) {
    case 'first-read': return { current: Math.min(metrics.readCount, 1), target: 1 }
    case 'reader-10': return { current: Math.min(metrics.readCount, 10), target: 10 }
    case 'reader-50': return { current: Math.min(metrics.readCount, 50), target: 50 }
    case 'reader-100': return { current: Math.min(metrics.readCount, 100), target: 100 }
    case 'word-10k': return { current: Math.min(metrics.totalWords, 10000), target: 10000 }
    case 'word-100k': return { current: Math.min(metrics.totalWords, 100000), target: 100000 }
    case 'word-500k': return { current: Math.min(metrics.totalWords, 500000), target: 500000 }
    case 'deep-reader': return { current: Math.min(metrics.longDocCount, 3), target: 3 }
    case 'first-quiz': return { current: Math.min(metrics.quizCount, 1), target: 1 }
    case 'quiz-10': return { current: Math.min(metrics.quizCount, 10), target: 10 }
    case 'quiz-50': return { current: Math.min(metrics.quizCount, 50), target: 50 }
    case 'quiz-machine': return { current: Math.min(metrics.totalQuizQuestions, 100), target: 100 }
    case 'perfectionist': return { current: Math.min((metrics as Record<string, number>).perfectScoreCount, 5), target: 5 }
    case 'first-highlight': return { current: metrics.hasHighlight ? 1 : 0, target: 1 }
    case 'first-comment': return { current: metrics.hasComment ? 1 : 0, target: 1 }
    case 'first-reply': return { current: metrics.hasReply ? 1 : 0, target: 1 }
    case 'annotation-50': return { current: Math.min(metrics.totalAnnotations, 50), target: 50 }
    case 'annotation-100': return { current: Math.min(metrics.totalAnnotations, 100), target: 100 }
    case 'rainbow': return { current: metrics.highlightColors.size, target: 6 }
    case 'reply-10': return { current: Math.min(metrics.totalReplies, 10), target: 10 }
    case 'streak-3': return { current: Math.min(metrics.currentStreak, 3), target: 3 }
    case 'streak-7': return { current: Math.min(metrics.currentStreak, 7), target: 7 }
    case 'streak-30': return { current: Math.min(metrics.currentStreak, 30), target: 30 }
    case 'searcher': return { current: Math.min(metrics.searchCount, 20), target: 20 }
    case 'tagger': return { current: Math.min(metrics.tagCount, 10), target: 10 }
    case 'bookmarker': return { current: Math.min(metrics.readLaterCount, 5), target: 5 }
    case 'ai-summary': return { current: Math.min(metrics.summaryCount, 1), target: 1 }
    default: return null
  }
}

export function getAchievementState(): AchievementState {
  return storageService.getAchievementState()
}

export function checkAchievements(
  existingState: AchievementState,
  metrics: Metrics
): { newUnlocks: Achievement[]; updatedState: AchievementState } {
  const existingSet = new Set(existingState.unlockedIds)
  const newUnlocks: Achievement[] = []

  for (const achievement of ACHIEVEMENTS) {
    if (existingSet.has(achievement.id)) continue
    if (checkCondition(achievement, metrics)) {
      newUnlocks.push(achievement)
    }
  }

  if (newUnlocks.length === 0) {
    return { newUnlocks: [], updatedState: existingState }
  }

  const updatedState: AchievementState = {
    unlockedIds: [...existingState.unlockedIds, ...newUnlocks.map(a => a.id)],
    unlockedAt: {
      ...existingState.unlockedAt,
      ...Object.fromEntries(newUnlocks.map(a => [a.id, Date.now()])),
    },
  }
  storageService.saveAchievementState(updatedState)

  return { newUnlocks, updatedState }
}
