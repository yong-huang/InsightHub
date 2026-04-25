import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip } from 'recharts'
import { useThemeColors } from '@/hooks/useThemeColors'
import type { ReadingHabitsData } from '@/utils/reportAggregator'

interface Props {
  data: ReadingHabitsData
}

export function ReadingHabits({ data }: Props) {
  const colors = useThemeColors()

  const weekdayData = data.weekdayAvg.map(d => ({
    ...d,
    total: d.weekday + d.weekend,
  }))

  const maxTotal = Math.max(1, ...weekdayData.map(d => d.total))

  return (
    <div className="report-habits-grid">
      <div>
        <div style={{ fontSize: '0.8rem', color: colors.textSecondary, marginBottom: '0.5rem' }}>Hourly Reading Distribution</div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data.hourlyDist}>
            <XAxis
              dataKey="hour"
              tick={{ fill: colors.textSecondary, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval={2}
              tickFormatter={(h: number) => `${h}:00`}
            />
            <Bar dataKey="count" fill={colors.accentBlue} radius={[3, 3, 0, 0]} />
            <Tooltip
              contentStyle={{
                background: colors.bgCard,
                border: `1px solid ${colors.borderDefault}`,
                borderRadius: '8px',
                color: colors.textPrimary,
                fontSize: '13px',
              }}
              formatter={(v: number) => [`${v} times`, 'Reading']}
              labelFormatter={(h: number) => `${h}:00`}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="report-habit-summary">
        {/* Streak stats */}
        <div className="report-habit-stat">
          <div className="report-habit-stat-value" style={{ color: colors.accentGreen }}>{data.currentStreak}</div>
          <div className="report-habit-stat-label">Current Reading Streak</div>
        </div>
        <div className="report-habit-stat">
          <div className="report-habit-stat-value" style={{ color: colors.accentOrange }}>{data.longestStreak}</div>
          <div className="report-habit-stat-label">Longest Reading Streak</div>
        </div>

        {/* Weekday distribution */}
        <div>
          <div style={{ fontSize: '0.8rem', color: colors.textSecondary, marginBottom: '0.5rem' }}>Day of Week Distribution</div>
          {weekdayData.map(d => (
            <div key={d.day} className="report-weekday-bar">
              <span className="report-weekday-label">{d.label}</span>
              <div className="report-weekday-track">
                <div
                  className="report-weekday-fill"
                  style={{
                    width: `${Math.max(5, (d.total / maxTotal) * 100)}%`,
                    background: (d.day === '0' || d.day === '6') ? colors.accentOrange : colors.accentBlue,
                  }}
                >
                  {d.total > 0 ? d.total : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
