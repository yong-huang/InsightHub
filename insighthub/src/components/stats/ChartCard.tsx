import type { ReactNode } from 'react'

interface ChartCardProps {
  title: string
  children: ReactNode
  extra?: ReactNode
}

export function ChartCard({ title, children, extra }: ChartCardProps) {
  return (
    <div className="stats-chart-card">
      <div className="stats-chart-header">
        <h3 className="stats-chart-title">{title}</h3>
        {extra && <div className="stats-chart-extra">{extra}</div>}
      </div>
      <div className="stats-chart-body">
        {children}
      </div>
    </div>
  )
}
