import { useEffect, useState } from 'react'
import type { Achievement } from '@/services/achievementService'

interface ToastItem {
  achievement: Achievement
  id: number
}

const ICON_MAP: Record<string, React.ReactNode> = {
  BookOpen: <span style={{ fontSize: '1.2rem' }}>📖</span>,
  FileText: <span style={{ fontSize: '1.2rem' }}>📄</span>,
  GraduationCap: <span style={{ fontSize: '1.2rem' }}>🎓</span>,
  BrainCircuit: <span style={{ fontSize: '1.2rem' }}>🧠</span>,
  Sparkles: <span style={{ fontSize: '1.2rem' }}>✨</span>,
  Trophy: <span style={{ fontSize: '1.2rem' }}>🏆</span>,
  Target: <span style={{ fontSize: '1.2rem' }}>🎯</span>,
  Highlighter: <span style={{ fontSize: '1.2rem' }}>🖍️</span>,
  MessageSquare: <span style={{ fontSize: '1.2rem' }}>💬</span>,
  Palette: <span style={{ fontSize: '1.2rem' }}>🎨</span>,
  Flame: <span style={{ fontSize: '1.2rem' }}>🔥</span>,
  Compass: <span style={{ fontSize: '1.2rem' }}>🧭</span>,
  Moon: <span style={{ fontSize: '1.2rem' }}>🌙</span>,
  Sun: <span style={{ fontSize: '1.2rem' }}>☀️</span>,
}

let toastIdCounter = 0
const TOAST_DURATION = 3500

export function AchievementToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as Achievement
      if (!detail) return
      const id = ++toastIdCounter
      setToasts(prev => [...prev, { achievement: detail, id }])
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id))
      }, TOAST_DURATION)
    }
    window.addEventListener('achievement-unlock', handler)
    return () => window.removeEventListener('achievement-unlock', handler)
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="achievement-toast-container">
      {toasts.map((toast, idx) => (
        <div
          key={toast.id}
          className="achievement-toast"
          style={{
            bottom: 16 + idx * 76,
            borderColor: `var(${toast.achievement.color})`,
          }}
        >
          <div className="achievement-toast-icon">
            {ICON_MAP[toast.achievement.icon] || <span>🏅</span>}
          </div>
          <div className="achievement-toast-content">
            <div className="achievement-toast-label">成就解锁!</div>
            <div className="achievement-toast-name">{toast.achievement.name}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
