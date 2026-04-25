import { useState, useMemo } from 'react'
import { Lock, Trophy } from 'lucide-react'
import {
  ACHIEVEMENTS,
  type Achievement,
  collectMetrics,
  getAchievementState,
  checkAchievements,
  getAchievementProgress,
} from '@/services/achievementService'

type CategoryFilter = 'all' | 'reading' | 'quiz' | 'annotation' | 'streak' | 'special'

const CATEGORY_TABS: { key: CategoryFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'reading', label: 'Reading' },
  { key: 'quiz', label: 'Quiz' },
  { key: 'annotation', label: 'Annotation' },
  { key: 'streak', label: 'Streak' },
  { key: 'special', label: 'Special' },
]

const ICON_MAP: Record<string, string> = {
  BookOpen: '📖',
  FileText: '📄',
  GraduationCap: '🎓',
  Library: '📚',
  BrainCircuit: '🧠',
  Sparkles: '✨',
  Trophy: '🏆',
  Target: '🎯',
  Zap: '⚡',
  Crown: '👑',
  Highlighter: '🖍️',
  MessageSquare: '💬',
  Palette: '🎨',
  Reply: '↩️',
  MessagesSquare: '💭',
  Flame: '🔥',
  Compass: '🧭',
  Search: '🔍',
  Tag: '🏷️',
  Bookmark: '🔖',
  Moon: '🌙',
  Sun: '☀️',
  Clock: '🕐',
  Calendar: '📅',
  Timer: '⏱️',
  Bot: '🤖',
}

function formatUnlockTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatProgress(current: number, target: number, achievement: Achievement): string {
  if (achievement.id.startsWith('word-')) {
    const fmt = (n: number) => n >= 10000 ? `${(n / 10000).toFixed(1)}0K` : `${n.toLocaleString()}`
    return `${fmt(current)} / ${fmt(target)}`
  }
  return `${current} / ${target}`
}

export function AchievementsPage() {
  const [activeTab, setActiveTab] = useState<CategoryFilter>('all')
  const metrics = useMemo(() => collectMetrics(), [])

  // Check for new unlocks on mount via initializer-like useMemo
  const state = useMemo(() => {
    const existing = getAchievementState()
    const { newUnlocks, updatedState } = checkAchievements(existing, metrics)
    if (newUnlocks.length > 0) {
      // Dispatch toast events after render
      requestAnimationFrame(() => {
        for (const achievement of newUnlocks) {
          window.dispatchEvent(new CustomEvent('achievement-unlock', { detail: achievement }))
        }
      })
    }
    return updatedState
  }, [metrics])

  const unlockedSet = new Set(state.unlockedIds)

  const filteredAchievements = useMemo(() => {
    if (activeTab === 'all') return ACHIEVEMENTS
    return ACHIEVEMENTS.filter(a => a.category === activeTab)
  }, [activeTab])

  const unlockCount = unlockedSet.size
  const total = ACHIEVEMENTS.length
  const pct = total > 0 ? (unlockCount / total) * 100 : 0

  return (
    <div className="cs-settings">
      {/* Page header */}
      <div className="cs-settings-header">
        <div className="cs-section-label">ACHIEVEMENTS</div>
        <h1>Achievements</h1>
        <p className="cs-settings-subtitle">
          Unlocked {unlockCount} / {total}
        </p>
      </div>

      {/* Achievements card */}
      <div className="cs-card">
        <div className="cs-card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Trophy size={16} style={{ color: 'var(--accent-yellow)' }} />
            ALL ACHIEVEMENTS
            <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 400, textTransform: 'none', letterSpacing: 'normal' }}>
              {Math.round(pct)}%
            </span>
          </div>
        </div>

        {/* Overall progress bar */}
        <div style={{
          height: 6,
          background: 'var(--border-subtle)',
          borderRadius: 3,
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: `${pct}%`,
            background: 'linear-gradient(90deg, var(--accent-yellow), var(--accent-orange))',
            borderRadius: 3,
            transition: 'width 0.5s var(--ease-smooth)',
          }} />
        </div>

        <div className="cs-card-body">
          {/* Category filter buttons */}
          <div className="cs-btn-group">
            {CATEGORY_TABS.map(tab => (
              <button
                key={tab.key}
                className={`cs-btn ${activeTab === tab.key ? 'cs-btn-primary' : 'cs-btn-secondary'}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Achievement grid */}
          <div className="cs-ach-grid">
            {filteredAchievements.map(achievement => {
              const unlocked = unlockedSet.has(achievement.id)
              const progress = unlocked ? null : getAchievementProgress(achievement, metrics)
              const unlockedAt = unlocked ? state.unlockedAt[achievement.id] : null

              return (
                <div
                  key={achievement.id}
                  className={`cs-ach-row ${unlocked ? 'unlocked' : 'locked'}`}
                  style={unlocked ? { borderLeftColor: `var(${achievement.color})` } : undefined}
                >
                  <div
                    className="cs-ach-icon"
                    style={{ backgroundColor: unlocked ? `var(${achievement.color}22)` : 'var(--border-subtle)' }}
                  >
                    {unlocked ? (
                      <span style={{ fontSize: '1.4rem' }}>{ICON_MAP[achievement.icon] || '🏅'}</span>
                    ) : (
                      <Lock size={16} style={{ color: 'var(--text-dim)', opacity: 0.5 }} />
                    )}
                  </div>
                  <div className="cs-ach-info">
                    <div className="cs-ach-name">
                      {achievement.name}
                    </div>
                    <div className="cs-ach-desc">
                      {achievement.description}
                    </div>
                    {unlocked && unlockedAt ? (
                      <div className="cs-ach-time">
                        {formatUnlockTime(unlockedAt)}
                      </div>
                    ) : progress ? (
                      <div className="cs-ach-progress">
                        <div className="cs-progress-bar">
                          <div
                            className="cs-progress-fill"
                            style={{
                              width: `${(progress.current / progress.target) * 100}%`,
                              backgroundColor: `var(${achievement.color})`,
                            }}
                          />
                        </div>
                        <span className="cs-ach-progress-text">
                          {formatProgress(progress.current, progress.target, achievement)}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>

          {filteredAchievements.length === 0 && unlockCount === 0 && (
            <div className="cs-empty-hint">
              No achievements unlocked yet. Start reading documents, completing quizzes, and adding annotations to unlock achievements!
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
