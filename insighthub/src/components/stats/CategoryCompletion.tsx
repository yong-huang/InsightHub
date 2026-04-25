import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'
import { buildCategoryCompletion } from '@/utils/statsAggregator'
import { useThemeColors } from '@/hooks/useThemeColors'
import type { Document } from '@/types'

interface Props {
  documents: Map<string, Document>
  source?: string
}

const PIE_COLORS = [
  '#326ce5', '#4ecdc4', '#ff8c42', '#a78bfa',
  '#ff6b6b', '#fbbf24', '#6366f1', '#22d3ee',
  '#f472b6', '#84cc16', '#fb923c', '#818cf8',
  '#34d399', '#f87171', '#facc15',
]

export function CategoryCompletion({ documents, source }: Props) {
  const colors = useThemeColors()
  const data = buildCategoryCompletion(documents, source)

  if (data.length === 0) {
    return <div className="stats-empty">No category data</div>
  }

  const total = data.reduce((s, d) => s + d.total, 0)

  return (
    <div className="stats-category-completion">
      <div className="stats-pie-container">
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
              dataKey="total"
              nameKey="name"
              stroke="none"
            >
              {data.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: colors.bgCard,
                border: `1px solid ${colors.borderDefault}`,
                borderRadius: '8px',
                color: colors.textPrimary,
                fontSize: '13px',
              }}
              formatter={(value: number, name: string) => {
                const item = data.find(d => d.name === name)
                return [`${value} docs (read ${item?.read || 0})`, name]
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="stats-pie-center">
          <div className="stats-pie-center-value">{total}</div>
          <div className="stats-pie-center-label">Total Documents</div>
        </div>
      </div>
      <div className="stats-pie-legend">
        {data.map((item, i) => (
          <div key={item.name} className="stats-pie-legend-item">
            <span
              className="stats-pie-legend-dot"
              style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
            />
            <span className="stats-pie-legend-name">{item.name}</span>
            <span className="stats-pie-legend-rate">{Math.round(item.rate * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
