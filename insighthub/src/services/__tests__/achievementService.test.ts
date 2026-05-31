import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/services/storageService', () => ({
  storageService: {
    getReadHistory: () => [],
    getSearchHistory: () => [],
    getReadLaterList: () => [],
    getSummaries: () => ({}),
    getAchievementState: () => ({ unlockedIds: [], unlockedAt: {} }),
    saveAchievementState: () => {},
    _getRaw: () => null,
  },
}))
vi.mock('@/stores/documentStore', () => ({
  useDocumentStore: { getState: () => ({ documents: new Map() }) },
}))
vi.mock('@/stores/quizStore', () => ({
  useQuizStore: { getState: () => ({ quizHistory: [], savedQuizzes: {} }) },
}))
vi.mock('@/stores/annotationStore', () => ({
  useAnnotationStore: { getState: () => ({ annotations: [] }) },
}))
vi.mock('@/stores/tagStore', () => ({
  useTagStore: { getState: () => ({ tags: [] }) },
}))
vi.mock('@/stores/conceptCardStore', () => ({
  useConceptCardStore: { getState: () => ({ cards: [] }) },
}))

import {
  ACHIEVEMENTS,
  checkAchievements,
  getAchievementProgress,
  type AchievementState,
  type Metrics,
} from '../achievementService'

function makeMetrics(overrides: Partial<Metrics> = {}): Metrics {
  return {
    readCount: 0,
    totalWords: 0,
    readCategoryKeys: new Set(),
    readSources: new Set(),
    longDocCount: 0,
    quizCount: 0,
    hasPerfectScore: false,
    perfectScoreCount: 0,
    consecutiveHighScores: 0,
    difficulties: new Set(),
    totalQuizQuestions: 0,
    totalAnnotations: 0,
    hasHighlight: false,
    hasComment: false,
    hasReply: false,
    highlightColors: new Set(),
    totalReplies: 0,
    searchCount: 0,
    tagCount: 0,
    currentStreak: 0,
    readHourSet: new Set(),
    readDaySet: new Set(),
    readLaterCount: 0,
    summaryCount: 0,
    conceptCardCount: 0,
    conceptDocSet: new Set(),
    spacedRepetitionSessions: 0,
    ...overrides,
  }
}

describe('checkCondition (via checkAchievements)', () => {
  const emptyState: AchievementState = { unlockedIds: [], unlockedAt: {} }

  it('first-read: readCount >= 1', () => {
    const metrics = makeMetrics({ readCount: 1 })
    const { newUnlocks } = checkAchievements(emptyState, metrics)
    expect(newUnlocks.find(a => a.id === 'first-read')).toBeDefined()
  })

  it('first-read: fails when readCount = 0', () => {
    const metrics = makeMetrics({ readCount: 0 })
    const { newUnlocks } = checkAchievements(emptyState, metrics)
    expect(newUnlocks.find(a => a.id === 'first-read')).toBeUndefined()
  })

  it('reader-10: readCount >= 10', () => {
    const metrics = makeMetrics({ readCount: 10 })
    const { newUnlocks } = checkAchievements(emptyState, metrics)
    expect(newUnlocks.find(a => a.id === 'reader-10')).toBeDefined()
  })

  it('word-10k: totalWords >= 10000', () => {
    const metrics = makeMetrics({ totalWords: 10000 })
    const { newUnlocks } = checkAchievements(emptyState, metrics)
    expect(newUnlocks.find(a => a.id === 'word-10k')).toBeDefined()
  })

  it('word-10k: fails when totalWords < 10000', () => {
    const metrics = makeMetrics({ totalWords: 9999 })
    const { newUnlocks } = checkAchievements(emptyState, metrics)
    expect(newUnlocks.find(a => a.id === 'word-10k')).toBeUndefined()
  })

  it('perfect-score: hasPerfectScore', () => {
    const metrics = makeMetrics({ hasPerfectScore: true })
    const { newUnlocks } = checkAchievements(emptyState, metrics)
    expect(newUnlocks.find(a => a.id === 'perfect-score')).toBeDefined()
  })

  it('streak-3: currentStreak >= 3', () => {
    const metrics = makeMetrics({ currentStreak: 3 })
    const { newUnlocks } = checkAchievements(emptyState, metrics)
    expect(newUnlocks.find(a => a.id === 'streak-3')).toBeDefined()
  })

  it('streak-3: fails when streak < 3', () => {
    const metrics = makeMetrics({ currentStreak: 2 })
    const { newUnlocks } = checkAchievements(emptyState, metrics)
    expect(newUnlocks.find(a => a.id === 'streak-3')).toBeUndefined()
  })

  it('night-owl: hour 0-5', () => {
    const metrics = makeMetrics({ readHourSet: new Set([2, 14]) })
    const { newUnlocks } = checkAchievements(emptyState, metrics)
    expect(newUnlocks.find(a => a.id === 'night-owl')).toBeDefined()
  })

  it('night-owl: fails when no midnight reading', () => {
    const metrics = makeMetrics({ readHourSet: new Set([10, 14]) })
    const { newUnlocks } = checkAchievements(emptyState, metrics)
    expect(newUnlocks.find(a => a.id === 'night-owl')).toBeUndefined()
  })

  it('early-bird: hour 5-7', () => {
    const metrics = makeMetrics({ readHourSet: new Set([6]) })
    const { newUnlocks } = checkAchievements(emptyState, metrics)
    expect(newUnlocks.find(a => a.id === 'early-bird')).toBeDefined()
  })

  it('early-bird: fails when no early morning reading', () => {
    const metrics = makeMetrics({ readHourSet: new Set([9, 15]) })
    const { newUnlocks } = checkAchievements(emptyState, metrics)
    expect(newUnlocks.find(a => a.id === 'early-bird')).toBeUndefined()
  })

  it('all-day-reader: morning + afternoon + evening', () => {
    const metrics = makeMetrics({ readHourSet: new Set([7, 14, 20]) })
    const { newUnlocks } = checkAchievements(emptyState, metrics)
    expect(newUnlocks.find(a => a.id === 'all-day-reader')).toBeDefined()
  })

  it('all-day-reader: fails when missing evening', () => {
    const metrics = makeMetrics({ readHourSet: new Set([7, 14]) })
    const { newUnlocks } = checkAchievements(emptyState, metrics)
    expect(newUnlocks.find(a => a.id === 'all-day-reader')).toBeUndefined()
  })

  it('weekend-reader: Sat/Sun reading', () => {
    // Create a daySet string for a Saturday (day 6) or Sunday (day 0)
    const now = new Date()
    // Find the next Saturday
    const sat = new Date(now)
    sat.setDate(sat.getDate() + ((6 - sat.getDay() + 7) % 7))
    const satKey = `${sat.getFullYear()}-${sat.getMonth()}-${sat.getDate()}`
    const metrics = makeMetrics({ readDaySet: new Set([satKey]) })
    const { newUnlocks } = checkAchievements(emptyState, metrics)
    expect(newUnlocks.find(a => a.id === 'weekend-reader')).toBeDefined()
  })

  it('weekend-reader: fails on weekday only', () => {
    // Monday
    const now = new Date()
    const mon = new Date(now)
    mon.setDate(mon.getDate() + ((1 - mon.getDay() + 7) % 7))
    const monKey = `${mon.getFullYear()}-${mon.getMonth()}-${mon.getDate()}`
    const metrics = makeMetrics({ readDaySet: new Set([monKey]) })
    const { newUnlocks } = checkAchievements(emptyState, metrics)
    expect(newUnlocks.find(a => a.id === 'weekend-reader')).toBeUndefined()
  })

  it('first-highlight: hasHighlight', () => {
    const metrics = makeMetrics({ hasHighlight: true })
    const { newUnlocks } = checkAchievements(emptyState, metrics)
    expect(newUnlocks.find(a => a.id === 'first-highlight')).toBeDefined()
  })

  it('first-quiz: quizCount >= 1', () => {
    const metrics = makeMetrics({ quizCount: 1 })
    const { newUnlocks } = checkAchievements(emptyState, metrics)
    expect(newUnlocks.find(a => a.id === 'first-quiz')).toBeDefined()
  })
})

describe('checkAchievements', () => {
  it('detects multiple new unlocks', () => {
    const metrics = makeMetrics({
      readCount: 10,
      quizCount: 1,
      hasPerfectScore: true,
      currentStreak: 3,
    })
    const { newUnlocks } = checkAchievements(
      { unlockedIds: [], unlockedAt: {} },
      metrics
    )
    expect(newUnlocks.length).toBeGreaterThanOrEqual(4)
    const ids = newUnlocks.map(a => a.id)
    expect(ids).toContain('first-read')
    expect(ids).toContain('reader-10')
    expect(ids).toContain('first-quiz')
    expect(ids).toContain('perfect-score')
    expect(ids).toContain('streak-3')
  })

  it('skips already unlocked achievements', () => {
    const metrics = makeMetrics({ readCount: 10 })
    const { newUnlocks } = checkAchievements(
      { unlockedIds: ['first-read', 'reader-10'], unlockedAt: {} },
      metrics
    )
    expect(newUnlocks.find(a => a.id === 'first-read')).toBeUndefined()
    expect(newUnlocks.find(a => a.id === 'reader-10')).toBeUndefined()
  })

  it('updates state with new unlock timestamps', () => {
    const metrics = makeMetrics({ readCount: 1 })
    const before = Date.now()
    const { updatedState } = checkAchievements(
      { unlockedIds: [], unlockedAt: {} },
      metrics
    )
    expect(updatedState.unlockedIds).toContain('first-read')
    expect(updatedState.unlockedAt['first-read']).toBeGreaterThanOrEqual(before)
  })

  it('returns empty when no new unlocks possible', () => {
    // All metrics zero — category-master passes because no categories exist (empty docs)
    const metrics = makeMetrics({ readCount: 0, readCategoryKeys: new Set() })
    const existing: AchievementState = { unlockedIds: ['category-master'], unlockedAt: {} }
    const { newUnlocks } = checkAchievements(existing, metrics)
    expect(newUnlocks).toEqual([])
  })
})

describe('getAchievementProgress', () => {
  it('returns current/target for numeric achievement', () => {
    const metrics = makeMetrics({ readCount: 5 })
    const achievement = ACHIEVEMENTS.find(a => a.id === 'reader-10')!
    const progress = getAchievementProgress(achievement, metrics)
    expect(progress).toEqual({ current: 5, target: 10 })
  })

  it('caps current at target', () => {
    const metrics = makeMetrics({ readCount: 15 })
    const achievement = ACHIEVEMENTS.find(a => a.id === 'reader-10')!
    const progress = getAchievementProgress(achievement, metrics)
    expect(progress).toEqual({ current: 10, target: 10 })
  })

  it('returns null for boolean achievements (e.g. perfect-score)', () => {
    const metrics = makeMetrics({ hasPerfectScore: false })
    const achievement = ACHIEVEMENTS.find(a => a.id === 'perfect-score')!
    const progress = getAchievementProgress(achievement, metrics)
    expect(progress).toBeNull()
  })

  it('returns null for complex achievements (e.g. high-scorer)', () => {
    const metrics = makeMetrics({ consecutiveHighScores: 0 })
    const achievement = ACHIEVEMENTS.find(a => a.id === 'high-scorer')!
    const progress = getAchievementProgress(achievement, metrics)
    expect(progress).toBeNull()
  })

  it('handles word-based achievements', () => {
    const metrics = makeMetrics({ totalWords: 5000 })
    const achievement = ACHIEVEMENTS.find(a => a.id === 'word-10k')!
    const progress = getAchievementProgress(achievement, metrics)
    expect(progress).toEqual({ current: 5000, target: 10000 })
  })

  it('handles streak achievements', () => {
    const metrics = makeMetrics({ currentStreak: 5 })
    const achievement = ACHIEVEMENTS.find(a => a.id === 'streak-7')!
    const progress = getAchievementProgress(achievement, metrics)
    expect(progress).toEqual({ current: 5, target: 7 })
  })
})
