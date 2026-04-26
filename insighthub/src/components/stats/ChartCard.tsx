import type { ReactNode } from 'react'

interface ChartCardProps {
  title: string
  children: ReactNode
  extra?: ReactNode
}

export function ChartCard({ title, children, extra }: ChartCardProps) {
  return (
    <div className="cs-card">
      <div className="cs-card-header">
        {title}
        {extra && <div style={{ marginLeft: 'auto' }}>{extra}</div>}
      </div>
      <div className="cs-card-body">
        {children}
      </div>
    </div>
  )
}
