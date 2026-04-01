import { useMemo, useState } from 'react'
import { buildHeatmapData, type HeatmapCell } from '@/utils/statsAggregator'
import type { Document } from '@/types'
import type { ReadHistoryEntry } from '@/services/storageService'

interface Props {
  entries: ReadHistoryEntry[]
  documents: Map<string, Document>
  source?: string
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

export function ReadingHeatmap({ entries, documents, source }: Props) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; cell: HeatmapCell } | null>(null)
  const { cells, weeks } = useMemo(
    () => buildHeatmapData(entries, documents, source),
    [entries, documents, source],
  )

  const cellMap = useMemo(() => {
    const m = new Map<string, HeatmapCell>()
    for (const c of cells) m.set(c.date, c)
    return m
  }, [cells])

  const colCount = weeks.length
  const totalCols = 1 + colCount // 1 label column + week columns

  // Month labels — positioned at the column where that month starts
  const monthLabels = useMemo(() => {
    const labels: { text: string; col: number }[] = []
    let lastMonth = ''
    for (let col = 0; col < weeks.length; col++) {
      const firstDate = weeks[col].find(d => d)
      if (!firstDate) continue
      const month = firstDate.slice(0, 7)
      if (month !== lastMonth) {
        labels.push({ text: `${parseInt(month.split('-')[1])}月`, col })
        lastMonth = month
      }
    }
    return labels
  }, [weeks])

  const totalReads = cells.reduce((s, c) => s + c.count, 0)

  return (
    <div className="stats-heatmap-container">
      <div className="stats-heatmap-header">
        <span className="stats-heatmap-total">
          共 <strong>{totalReads}</strong> 次阅读
        </span>
      </div>

      <div
        className="stats-heatmap-grid"
        style={{ gridTemplateColumns: `24px repeat(${colCount}, 12px)`, gridTemplateRows: '16px repeat(7, 12px)' }}
      >
        {/* Month label row (row 1) */}
        {monthLabels.map(({ text, col }) => (
          <div
            key={text + col}
            className="stats-heatmap-month-label"
            style={{ gridColumn: col + 2, gridRow: 1 }}
          >
            {text}
          </div>
        ))}

        {/* Weekday labels (column 1, rows 2-8) */}
        {WEEKDAYS.map((day, row) => (
          <div
            key={day}
            className="stats-heatmap-weekday-label"
            style={{ gridColumn: 1, gridRow: row + 2 }}
          >
            {row % 2 === 1 ? day : ''}
          </div>
        ))}

        {/* Cells: weeks[col][row] → gridColumn col+2, gridRow row+2 */}
        {weeks.map((week, col) =>
          week.map((date, row) => {
            const cell = date ? cellMap.get(date) : null
            const isEmpty = !cell || cell.level === 0

            return (
              <div
                key={`${col}-${row}`}
                className={`stats-heatmap-cell ${cell ? `level-${cell.level}` : 'empty'}`}
                style={{ gridColumn: col + 2, gridRow: row + 2 }}
                onMouseEnter={cell ? (e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  setTooltip({
                    x: rect.left + rect.width / 2,
                    y: rect.top - 4,
                    cell,
                  })
                } : undefined}
                onMouseLeave={() => setTooltip(null)}
              />
            )
          })
        )}
      </div>

      {/* Legend */}
      <div className="stats-heatmap-legend">
        <span className="stats-heatmap-legend-label">少</span>
        {[0, 1, 2, 3, 4].map(level => (
          <div key={level} className={`stats-heatmap-cell level-${level}`} />
        ))}
        <span className="stats-heatmap-legend-label">多</span>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="stats-heatmap-tooltip"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <strong>{tooltip.cell.date}</strong>
          <br />
          {tooltip.cell.count} 次阅读
        </div>
      )}
    </div>
  )
}
