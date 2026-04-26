import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { buildWordCountDist } from '@/utils/statsAggregator'
import { useThemeColors } from '@/hooks/useThemeColors'
import type { Document } from '@/types'

interface Props {
  documents: Map<string, Document>
  source?: string
}

export function WordCountDist({ documents, source }: Props) {
  const colors = useThemeColors()
  const data = buildWordCountDist(documents, source)

  if (data.every(d => d.count === 0)) {
    return <div className="stats-empty">No word count data</div>
  }

  return (
    <div className="stats-word-dist">
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.borderDefault} />
          <XAxis
            dataKey="range"
            stroke={colors.textDim}
            fontSize={11}
            tickLine={false}
            axisLine={false}
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
            formatter={((value: number) => [`${value} docs`, 'Document Count']) as any}
          />
          <Bar
            dataKey="count"
            fill={colors.accentGreen}
            radius={[4, 4, 0, 0]}
            maxBarSize={48}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
