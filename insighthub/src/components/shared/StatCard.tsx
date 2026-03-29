import type { ReactNode } from 'react'

interface StatCardProps {
  icon: ReactNode
  label: string
  value: number | string
  color?: string
  className?: string
}

export function StatCard({ icon, label, value, color = 'var(--accent-blue)', className = '' }: StatCardProps) {
  return (
    <div className={`stat-card card ${className}`}>
      <div className="stat-card-icon" style={{ color, background: `${color}15` }}>
        {icon}
      </div>
      <div className="stat-card-info">
        <span className="stat-card-value">{typeof value === 'number' ? value.toLocaleString() : value}</span>
        <span className="stat-card-label">{label}</span>
      </div>
    </div>
  )
}
