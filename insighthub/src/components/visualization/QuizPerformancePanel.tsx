import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip, LineChart, Line } from 'recharts'
import { useThemeColors } from '@/hooks/useThemeColors'
import type { QuizPerfData } from '@/utils/reportAggregator'

interface Props {
  data: QuizPerfData
}

export function QuizPerformancePanel({ data }: Props) {
  const colors = useThemeColors()

  const scorePct = Math.round(data.avgScore)
  const circumference = 2 * Math.PI * 45
  const dashOffset = circumference * (1 - scorePct / 100)
  const scoreColor = scorePct >= 80 ? colors.accentGreen : scorePct >= 60 ? colors.accentYellow : colors.accentRed

  return (
    <div className="report-quiz-panel">
      {/* Gauge */}
      <div className="report-quiz-gauge">
        <svg viewBox="0 0 100 100" width={120} height={120}>
          <circle cx="50" cy="50" r="45" fill="none" stroke={colors.borderDefault} strokeWidth="8" />
          <circle
            cx="50" cy="50" r="45"
            fill="none"
            stroke={scoreColor}
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
          />
        </svg>
        <div className="report-quiz-gauge-value" style={{ color: scoreColor }}>{scorePct}</div>
        <div className="report-quiz-gauge-label">Average Score</div>
      </div>

      {/* Stats */}
      <div className="report-quiz-stats">
        <div className="report-quiz-stat-row">
          <span className="report-quiz-stat-label">Highest Score</span>
          <span className="report-quiz-stat-value">{Math.round(data.maxScore)}</span>
        </div>
        <div className="report-quiz-stat-row">
          <span className="report-quiz-stat-label">Average Score</span>
          <span className="report-quiz-stat-value">{Math.round(data.avgScore)}</span>
        </div>

        {/* Difficulty distribution bar */}
        <div style={{ marginTop: '0.5rem' }}>
          <div style={{ fontSize: '0.8rem', color: colors.textSecondary, marginBottom: '0.4rem' }}>Difficulty Distribution</div>
          <ResponsiveContainer width="100%" height={80}>
            <BarChart data={data.difficultyDist}>
              <XAxis dataKey="difficulty" tick={{ fill: colors.textSecondary, fontSize: 11 }} axisLine={false} tickLine={false} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {data.difficultyDist.map((_, i) => (
                  <rect key={i} fill={['#4ecdc4', '#fbbf24', '#ff6b6b'][i]} />
                ))}
              </Bar>
              <Tooltip
                contentStyle={{
                  background: colors.bgCard,
                  border: `1px solid ${colors.borderDefault}`,
                  borderRadius: '8px',
                  color: colors.textPrimary,
                  fontSize: '13px',
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Score trend (if data) */}
      {data.scoreTrend.length >= 2 && (
        <div style={{ width: '100%', marginTop: '1rem' }}>
          <div style={{ fontSize: '0.8rem', color: colors.textSecondary, marginBottom: '0.4rem' }}>Score Trend</div>
          <ResponsiveContainer width="100%" height={100}>
            <LineChart data={data.scoreTrend.slice(-20)}>
              <XAxis dataKey="date" tick={{ fill: colors.textSecondary, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Line type="monotone" dataKey="score" stroke={colors.accentBlue} strokeWidth={2} dot={false} />
              <Tooltip
                contentStyle={{
                  background: colors.bgCard,
                  border: `1px solid ${colors.borderDefault}`,
                  borderRadius: '8px',
                  color: colors.textPrimary,
                  fontSize: '13px',
                }}
                formatter={(v: unknown) => [`${Math.round(Number(v))} pts`, 'Average Score']}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
