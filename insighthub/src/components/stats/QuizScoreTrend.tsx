import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts'
import { buildQuizScoreTrend } from '@/utils/statsAggregator'
import { useThemeColors } from '@/hooks/useThemeColors'
import type { Document, QuizAttempt } from '@/types'

interface Props {
  attempts: QuizAttempt[]
  documents: Map<string, Document>
  source?: string
}

export function QuizScoreTrend({ attempts, documents, source }: Props) {
  const colors = useThemeColors()
  const data = buildQuizScoreTrend(attempts, documents, source)

  if (data.length === 0) {
    return <div className="stats-empty">No quiz records</div>
  }

  return (
    <div className="stats-quiz-trend">
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.borderDefault} />
          <XAxis
            dataKey="date"
            tickFormatter={(d: string) => d.slice(5)}
            stroke={colors.textDim}
            fontSize={11}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={[0, 100]}
            stroke={colors.textDim}
            fontSize={11}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `${v}`}
          />
          <ReferenceLine y={60} stroke={colors.accentOrange} strokeDasharray="4 4" label="" />
          <Tooltip
            contentStyle={{
              background: colors.bgCard,
              border: `1px solid ${colors.borderDefault}`,
              borderRadius: '8px',
              color: colors.textPrimary,
              fontSize: '13px',
            }}
            formatter={((value: number) => [`${(value as number).toFixed(1)} pts`, 'Average Score']) as any}
            labelFormatter={((label: any) => String(label)) as any}
          />
          <Line
            type="monotone"
            dataKey="avgScore"
            stroke={colors.accentPurple}
            strokeWidth={2}
            dot={{ r: 4, fill: colors.accentPurple }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
