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
        <div style={{ fontSize: '0.8rem', color: colors.textSecondary, marginBottom: '0.5rem' }}>每小时阅读分布</div>
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
              formatter={(v: number) => [`${v} 次`, '阅读']}
              labelFormatter={(h: number) => `${h}:00`}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="report-habit-summary">
        {/* Streak stats */}
        <div className="report-habit-stat">
          <div className="report-habit-stat-value" style={{ color: colors.accentGreen }}>{data.currentStreak}</div>
          <div className="report-habit-stat-label">当前连续阅读天数</div>
        </div>
        <div className="report-habit-stat">
          <div className="report-habit-stat-value" style={{ color: colors.accentOrange }}>{data.longestStreak}</div>
          <div className="report-habit-stat-label">最长连续阅读天数</div>
        </div>

        {/* Weekday distribution */}
        <div>
          <div style={{ fontSize: '0.8rem', color: colors.textSecondary, marginBottom: '0.5rem' }}>星期分布</div>
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
