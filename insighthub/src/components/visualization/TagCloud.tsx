import { useNavigate } from 'react-router-dom'
import type { TagCloudItem } from '@/utils/reportAggregator'

interface Props {
  data: TagCloudItem[]
}

export function TagCloud({ data }: Props) {
  const navigate = useNavigate()

  if (data.length === 0) {
    return <div className="stats-empty">No tag data</div>
  }

  const maxCount = Math.max(1, ...data.map(d => d.count))

  return (
    <div className="report-tag-cloud">
      {data.map(tag => {
        const ratio = tag.count / maxCount
        const fontSize = 0.7 + ratio * 0.6 // 0.7rem to 1.3rem
        const opacity = 0.6 + ratio * 0.4
        return (
          <span
            key={tag.id}
            className="report-tag-item"
            style={{
              fontSize: `${fontSize}rem`,
              opacity,
              background: `${tag.color}18`,
              color: tag.color,
              borderColor: `${tag.color}30`,
            }}
            onClick={() => navigate(`/tag/${tag.id}`)}
          >
            {tag.name}
            <span className="report-tag-count">{tag.count}</span>
          </span>
        )
      })}
    </div>
  )
}
