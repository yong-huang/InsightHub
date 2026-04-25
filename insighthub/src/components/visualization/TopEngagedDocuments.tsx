import { useNavigate, useLocation } from 'react-router-dom'
import type { TopEngagedDoc } from '@/utils/reportAggregator'

interface Props {
  title: string
  data: TopEngagedDoc[]
  unit: string
}

export function TopEngagedDocuments({ title, data, unit }: Props) {
  const navigate = useNavigate()
  const location = useLocation()

  if (data.length === 0) {
    return <div className="stats-empty">No data</div>
  }

  return (
    <div>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>{title}</div>
      <div className="report-top-list">
        {data.map((doc, i) => (
          <div
            key={doc.id}
            className="report-top-item"
            onClick={() => navigate(`/doc/${doc.id}`, { state: { from: location.pathname } })}
          >
            <span className="report-top-rank">{i + 1}</span>
            <div className="report-top-info">
              <div className="report-top-title">{doc.title}</div>
              <div className="report-top-meta">{doc.category}</div>
            </div>
            <span className="report-top-count">{doc.count} {unit}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
