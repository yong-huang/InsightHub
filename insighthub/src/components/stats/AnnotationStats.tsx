import { buildAnnotationStats } from '@/utils/statsAggregator'
import type { Document, Annotation } from '@/types'

interface Props {
  annotations: Annotation[]
  documents: Map<string, Document>
  source?: string
}

export function AnnotationStats({ annotations, documents, source }: Props) {
  const stats = buildAnnotationStats(annotations, documents, source)

  return (
    <div className="stats-annotation-stats">
      <div className="stats-annotation-overview">
        <div className="stats-annotation-item">
          <div className="stats-annotation-value">{stats.total}</div>
          <div className="stats-annotation-label">Total Annotations</div>
        </div>
        <div className="stats-annotation-item">
          <div className="stats-annotation-value">{stats.highlightCount}</div>
          <div className="stats-annotation-label">Highlights</div>
        </div>
        <div className="stats-annotation-item">
          <div className="stats-annotation-value">{stats.commentCount}</div>
          <div className="stats-annotation-label">Comments</div>
        </div>
        <div className="stats-annotation-item">
          <div className="stats-annotation-value">{stats.docsWithAnnotations}</div>
          <div className="stats-annotation-label">Documents</div>
        </div>
      </div>

      {stats.colorDistribution.length > 0 && (
        <div className="stats-color-dist">
          <div className="stats-color-dist-title">Color Distribution</div>
          <div className="stats-color-dist-bars">
            {stats.colorDistribution.map(({ color, count }) => {
              const pct = stats.total > 0 ? (count / stats.total) * 100 : 0
              return (
                <div key={color} className="stats-color-bar-row">
                  <span
                    className="stats-color-bar-swatch"
                    style={{ background: color }}
                  />
                  <div className="stats-color-bar-track">
                    <div
                      className="stats-color-bar-fill"
                      style={{
                        width: `${pct}%`,
                        background: color,
                      }}
                    />
                  </div>
                  <span className="stats-color-bar-count">{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
