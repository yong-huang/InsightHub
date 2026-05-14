import { BookOpen, Brain, MessageSquare, FileText, Calendar, Trophy } from 'lucide-react'
import type { ReportOverview } from '@/utils/reportAggregator'

interface Props {
  data: ReportOverview
}

const formatNumber = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

const HERO_ITEMS = [
  { key: 'readDocs' as const, label: 'Documents Read', icon: BookOpen, gradient: 'linear-gradient(135deg, #326ce5, #4ecdc4)' },
  { key: 'totalWords' as const, label: 'Words Read', icon: FileText, gradient: 'linear-gradient(135deg, #4ecdc4, #22d3ee)', format: true },
  { key: 'activeDays' as const, label: 'Active Days', icon: Calendar, gradient: 'linear-gradient(135deg, #a78bfa, #6366f1)' },
  { key: 'achievements' as const, label: 'Achievements', icon: Trophy, gradient: 'linear-gradient(135deg, #fbbf24, #f59e0b)' },
  { key: 'quizCount' as const, label: 'Quizzes', icon: Brain, gradient: 'linear-gradient(135deg, #ff8c42, #f97316)' },
  { key: 'annotationCount' as const, label: 'Annotations', icon: MessageSquare, gradient: 'linear-gradient(135deg, #ff6b6b, #ef4444)' },
]

export function ReportHero({ data }: Props) {
  return (
    <div className="report-hero">
      {HERO_ITEMS.map(item => {
        const Icon = item.icon
        const value = data[item.key]
        return (
          <div key={item.key} className="report-hero-item" style={{ background: item.gradient }}>
            <div className="report-hero-value">
              {item.format ? formatNumber(value) : value}
            </div>
            <div className="report-hero-label">{item.label}</div>
            <Icon size={36} className="report-hero-icon" />
          </div>
        )
      })}
    </div>
  )
}
