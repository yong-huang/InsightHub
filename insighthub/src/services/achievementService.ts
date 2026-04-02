import { storageService } from '@/services/storageService'
import { useDocumentStore } from '@/stores/documentStore'
import { useQuizStore } from '@/stores/quizStore'
import { useAnnotationStore } from '@/stores/annotationStore'
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
  // Annotation
  totalAnnotations: number
  hasHighlight: boolean
  hasComment: boolean
  highlightColors: Set<string>
  // Streak / time
  currentStreak: number
  readHourSet: Set<number> // hours (0-23) with reading records
}

export const ACHIEVEMENTS: Achievement[] = [
  // Reading
  { id: 'first-read', name: '初次阅读', description: '标记第一篇文档为已读', icon: 'BookOpen', color: '--accent-blue', category: 'reading' },
  { id: 'reader-10', name: '博览群书', description: '阅读 10 篇文档', icon: 'BookOpen', color: '--accent-blue', category: 'reading' },
  { id: 'reader-50', name: '书虫', description: '阅读 50 篇文档', icon: 'BookOpen', color: '--accent-blue', category: 'reading' },
  { id: 'word-10k', name: '万卷书', description: '累计阅读 1 万字', icon: 'FileText', color: '--accent-purple', category: 'reading' },
  { id: 'word-100k', name: '学富五车', description: '累计阅读 10 万字', icon: 'FileText', color: '--accent-purple', category: 'reading' },
  { id: 'category-master', name: '全能学者', description: '所有分类至少读一篇', icon: 'GraduationCap', color: '--accent-green', category: 'reading' },

  // Quiz
  { id: 'first-quiz', name: '初次测验', description: '完成第一次测验', icon: 'BrainCircuit', color: '--accent-purple', category: 'quiz' },
  { id: 'quiz-10', name: '测验达人', description: '完成 10 次测验', icon: 'BrainCircuit', color: '--accent-purple', category: 'quiz' },
  { id: 'perfect-score', name: '满分通过', description: '测验获得满分 (100%)', icon: 'Sparkles', color: '--accent-yellow', category: 'quiz' },
  { id: 'high-scorer', name: '高分选手', description: '连续 3 次测验 ≥90 分', icon: 'Trophy', color: '--accent-yellow', category: 'quiz' },
  { id: 'quiz-all-difficulty', name: '全面挑战', description: '在三种难度下各完成一次测验', icon: 'Target', color: '--accent-orange', category: 'quiz' },

  // Annotation
  { id: 'first-highlight', name: '初次标注', description: '创建第一条高亮', icon: 'Highlighter', color: '--accent-green', category: 'annotation' },
  { id: 'first-comment', name: '初次评论', description: '创建第一条评论批注', icon: 'MessageSquare', color: '--accent-green', category: 'annotation' },
  { id: 'annotation-50', name: '批注达人', description: '累计 50 条批注', icon: 'MessageSquare', color: '--accent-green', category: 'annotation' },
  { id: 'rainbow', name: '色彩大师', description: '使用全部 6 种高亮颜色', icon: 'Palette', color: '--accent-purple', category: 'annotation' },

  // Streak & Explore
  { id: 'streak-3', name: '连续三天', description: '连续 3 天有阅读记录', icon: 'Flame', color: '--accent-orange', category: 'streak' },
  { id: 'streak-7', name: '一周坚持', description: '连续 7 天有阅读记录', icon: 'Flame', color: '--accent-orange', category: 'streak' },
  { id: 'streak-30', name: '月度打卡', description: '连续 30 天有阅读记录', icon: 'Flame', color: '--accent-red', category: 'streak' },
  { id: 'explorer', name: '探索者', description: '同时探索两个来源 (MindInsight + TechInsight)', icon: 'Compass', color: '--accent-blue', category: 'streak' },

  // Special
  { id: 'night-owl', name: '夜猫子', description: '在 0:00-6:00 之间有阅读记录', icon: 'Moon', color: '--accent-purple', category: 'special' },
  { id: 'early-bird', name: '早起鸟', description: '在 5:00-8:00 之间有阅读记录', icon: 'Sun', color: '--accent-yellow', category: 'special' },
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

  // Quiz metrics
  const quizCount = quizHistory.length
  const hasPerfectScore = quizHistory.some(
    a => a.totalScore > 0 && a.totalScore === a.maxScore
  )
  // Consecutive high scores (>= 90%) from most recent
  let consecutiveHighScores = 0
  for (let i = quizHistory.length - 1; i >= 0; i--) {
    const a = quizHistory[i]
    if (a.maxScore > 0 && (a.totalScore / a.maxScore) >= 0.9) {
      consecutiveHighScores++
    } else {
      break
    }
  }
  // Wait — quizHistory is sorted newest first by storageService.addQuizAttempt (unshift).
  // So quizHistory[0] is the most recent. Let's re-check.
  consecutiveHighScores = 0
  for (let i = 0; i < quizHistory.length; i++) {
    const a = quizHistory[i]
    if (a.maxScore > 0 && (a.totalScore / a.maxScore) >= 0.9) {
      consecutiveHighScores++
    } else {
      break
    }
  }

  const difficulties = new Set<string>()
  // Collect difficulties from quiz attempts' associated quizzes
  const quizzes = storageService.getQuizzes()
  for (const attempt of quizHistory) {
    const quiz = quizzes[attempt.documentId]
    if (quiz?.questions?.length) {
      // Use the first question's difficulty as representative
      difficulties.add(quiz.questions[0].difficulty || 'medium')
    }
  }

  // Annotation metrics
  const totalAnnotations = annotations.length
  const hasHighlight = annotations.some(a => a.type === 'highlight')
  const hasComment = annotations.some(a => a.type === 'comment')
  const highlightColors = new Set<string>()
  for (const a of annotations) {
    if (a.type === 'highlight' && a.color) {
      highlightColors.add(a.color)
    }
  }

  // Streak & time metrics
  const currentStreak = computeStreak(readHistory)
  const readHourSet = new Set<number>()
  for (const entry of readHistory) {
    readHourSet.add(new Date(entry.readAt).getHours())
  }

  return {
    readCount, totalWords, readCategoryKeys, hasMindInsight, hasTechInsight,
    quizCount, hasPerfectScore, consecutiveHighScores, difficulties,
    totalAnnotations, hasHighlight, hasComment, highlightColors,
    currentStreak, readHourSet,
  }
}

function checkCondition(achievement: Achievement, metrics: Metrics): boolean {
  switch (achievement.id) {
    // Reading
    case 'first-read': return metrics.readCount >= 1
    case 'reader-10': return metrics.readCount >= 10
    case 'reader-50': return metrics.readCount >= 50
    case 'word-10k': return metrics.totalWords >= 10000
    case 'word-100k': return metrics.totalWords >= 100000
    case 'category-master': {
      const allCategoryKeys = new Set(CATEGORIES.map(c => c.key))
      for (const key of allCategoryKeys) {
        if (!metrics.readCategoryKeys.has(key)) return false
      }
      return true
    }
    // Quiz
    case 'first-quiz': return metrics.quizCount >= 1
    case 'quiz-10': return metrics.quizCount >= 10
    case 'perfect-score': return metrics.hasPerfectScore
    case 'high-scorer': return metrics.consecutiveHighScores >= 3
    case 'quiz-all-difficulty':
      return metrics.difficulties.has('easy') && metrics.difficulties.has('medium') && metrics.difficulties.has('hard')
    // Annotation
    case 'first-highlight': return metrics.hasHighlight
    case 'first-comment': return metrics.hasComment
    case 'annotation-50': return metrics.totalAnnotations >= 50
    case 'rainbow': return metrics.highlightColors.size >= 6
    // Streak
    case 'streak-3': return metrics.currentStreak >= 3
    case 'streak-7': return metrics.currentStreak >= 7
    case 'streak-30': return metrics.currentStreak >= 30
    case 'explorer': return metrics.hasMindInsight && metrics.hasTechInsight
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
    default: return false
  }
}

// Get progress info for number-based achievements
export function getAchievementProgress(achievement: Achievement, metrics: Metrics): { current: number; target: number } | null {
  switch (achievement.id) {
    case 'first-read': return { current: Math.min(metrics.readCount, 1), target: 1 }
    case 'reader-10': return { current: Math.min(metrics.readCount, 10), target: 10 }
    case 'reader-50': return { current: Math.min(metrics.readCount, 50), target: 50 }
    case 'word-10k': return { current: Math.min(metrics.totalWords, 10000), target: 10000 }
    case 'word-100k': return { current: Math.min(metrics.totalWords, 100000), target: 100000 }
    case 'first-quiz': return { current: Math.min(metrics.quizCount, 1), target: 1 }
    case 'quiz-10': return { current: Math.min(metrics.quizCount, 10), target: 10 }
    case 'first-highlight': return { current: metrics.hasHighlight ? 1 : 0, target: 1 }
    case 'first-comment': return { current: metrics.hasComment ? 1 : 0, target: 1 }
    case 'annotation-50': return { current: Math.min(metrics.totalAnnotations, 50), target: 50 }
    case 'rainbow': return { current: metrics.highlightColors.size, target: 6 }
    case 'streak-3': return { current: Math.min(metrics.currentStreak, 3), target: 3 }
    case 'streak-7': return { current: Math.min(metrics.currentStreak, 7), target: 7 }
    case 'streak-30': return { current: Math.min(metrics.currentStreak, 30), target: 30 }
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
