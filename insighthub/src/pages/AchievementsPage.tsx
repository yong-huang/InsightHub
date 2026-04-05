import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Lock, Trophy } from 'lucide-react'
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
  { key: 'all', label: '全部' },
  { key: 'reading', label: '阅读' },
  { key: 'quiz', label: '测验' },
  { key: 'annotation', label: '批注' },
  { key: 'streak', label: '坚持' },
  { key: 'special', label: '特殊' },
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
    const fmt = (n: number) => n >= 10000 ? `${(n / 10000).toFixed(1)}万` : `${n}`
    return `${fmt(current)} / ${fmt(target)}`
  }
  return `${current} / ${target}`
}

export function AchievementsPage() {
  const navigate = useNavigate()
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

  return (
    <div className="achievements-page">
      <div className="stats-page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} title="返回">
            <ArrowLeft size={18} />
          </button>
          <h1 className="stats-page-title">
            <Trophy size={22} style={{ marginRight: 8, verticalAlign: 'middle', color: 'var(--accent-yellow)' }} />
            成就
          </h1>
        </div>
        <p className="stats-page-desc">
          已解锁 {unlockCount} / {ACHIEVEMENTS.length} 个成就
        </p>
      </div>

      {/* Progress bar */}
      <div className="achievements-overall-progress">
        <div
          className="achievements-overall-fill"
          style={{ width: `${(unlockCount / ACHIEVEMENTS.length) * 100}%` }}
        />
      </div>

      {/* Category tabs */}
      <div className="achievement-tab-bar">
        {CATEGORY_TABS.map(tab => (
          <button
            key={tab.key}
            className={`achievement-tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Achievement grid */}
      <div className="achievements-grid">
        {filteredAchievements.map(achievement => {
          const unlocked = unlockedSet.has(achievement.id)
          const progress = unlocked ? null : getAchievementProgress(achievement, metrics)
          const unlockedAt = unlocked ? state.unlockedAt[achievement.id] : null

          return (
            <div
              key={achievement.id}
              className={`achievement-card ${unlocked ? 'unlocked' : 'locked'}`}
            >
              <div
                className="achievement-icon-wrap"
                style={{ backgroundColor: unlocked ? `var(${achievement.color}22)` : 'var(--border-subtle)' }}
              >
                {unlocked ? (
                  <span style={{ fontSize: '1.6rem' }}>{ICON_MAP[achievement.icon] || '🏅'}</span>
                ) : (
                  <Lock size={20} style={{ color: 'var(--text-dim)', opacity: 0.5 }} />
                )}
              </div>
              <div className="achievement-card-body">
                <div className="achievement-card-name" style={{ color: unlocked ? 'var(--text-primary)' : 'var(--text-dim)' }}>
                  {achievement.name}
                </div>
                <div className="achievement-card-desc">
                  {achievement.description}
                </div>
                {unlocked && unlockedAt ? (
                  <div className="achievement-card-time">
                    {formatUnlockTime(unlockedAt)}
                  </div>
                ) : progress ? (
                  <div className="achievement-progress">
                    <div className="achievement-progress-bar">
                      <div
                        className="achievement-progress-fill"
                        style={{
                          width: `${(progress.current / progress.target) * 100}%`,
                          backgroundColor: `var(${achievement.color})`,
                        }}
                      />
                    </div>
                    <span className="achievement-progress-text">
                      {formatProgress(progress.current, progress.target, achievement)}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>

      {unlockCount === 0 && (
        <div className="empty-state" style={{ marginTop: '2rem' }}>
          <Trophy size={48} />
          <h3>还没有解锁任何成就</h3>
          <p>开始阅读文档、完成测验、添加批注来解锁成就吧!</p>
        </div>
      )}
    </div>
  )
}
