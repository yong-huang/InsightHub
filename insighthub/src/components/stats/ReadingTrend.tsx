import { useState } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { buildReadingTrend } from '@/utils/statsAggregator'
import { useThemeColors } from '@/hooks/useThemeColors'
import type { Document } from '@/types'
import type { ReadHistoryEntry } from '@/services/storageService'

interface Props {
  entries: ReadHistoryEntry[]
  documents: Map<string, Document>
  source?: string
}

export function ReadingTrend({ entries, documents, source }: Props) {
  const [mode, setMode] = useState<'daily' | 'weekly'>('daily')
  const colors = useThemeColors()
  const data = buildReadingTrend(entries, documents, source, mode)

  const formatDateLabel = (date: string) => {
    if (mode === 'weekly') return date.slice(5) // MM-DD
    return date.slice(8) // DD
  }

  if (data.length === 0) {
    return <div className="stats-empty">No reading records</div>
  }

  return (
    <div className="stats-reading-trend">
      <div className="stats-trend-toggle">
        <button
          className={mode === 'daily' ? 'active' : ''}
          onClick={() => setMode('daily')}
        >
          Day
        </button>
        <button
          className={mode === 'weekly' ? 'active' : ''}
          onClick={() => setMode('weekly')}
        >
          Week
        </button>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.borderDefault} />
          <XAxis
            dataKey="date"
            tickFormatter={formatDateLabel}
            stroke={colors.textDim}
            fontSize={11}
            tickLine={false}
            axisLine={false}
            interval={mode === 'daily' ? 4 : 0}
          />
          <YAxis
            stroke={colors.textDim}
            fontSize={11}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: colors.bgCard,
              border: `1px solid ${colors.borderDefault}`,
              borderRadius: '8px',
              color: colors.textPrimary,
              fontSize: '13px',
            }}
            formatter={(value: unknown) => [`${Number(value)} docs`, 'Reading Count']}
            labelFormatter={(label: unknown) => String(label)}
          />
          <Line
            type="monotone"
            dataKey="count"
            stroke={colors.accentBlue}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: colors.accentBlue }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
