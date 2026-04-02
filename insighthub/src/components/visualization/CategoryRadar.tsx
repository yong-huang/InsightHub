import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar, Tooltip } from 'recharts'
import { useThemeColors } from '@/hooks/useThemeColors'
import { getCategoryInfo } from '@/utils/categoryMap'
import type { CategoryDistItem } from '@/utils/reportAggregator'

interface Props {
  data: CategoryDistItem[]
}

export function CategoryRadar({ data }: Props) {
  const colors = useThemeColors()

  if (data.length === 0) {
    return <div className="stats-empty">暂无分类数据</div>
  }

  const maxRead = Math.max(1, ...data.map(d => d.read))
  const chartData = data.slice(0, 15).map(item => {
    const info = getCategoryInfo(item.name)
    return {
      name: info?.label || item.name,
      value: item.read,
      fullMark: maxRead,
    }
  })

  return (
    <ResponsiveContainer width="100%" height={300}>
      <RadarChart data={chartData}>
        <PolarGrid stroke={colors.borderDefault} />
        <PolarAngleAxis
          dataKey="name"
          tick={{ fill: colors.textSecondary, fontSize: 11 }}
        />
        <Radar
          name="已读文档"
          dataKey="value"
          stroke={colors.accentBlue}
          fill={colors.accentBlueLight}
          fillOpacity={0.4}
          strokeWidth={2}
        />
        <Tooltip
          contentStyle={{
            background: colors.bgCard,
            border: `1px solid ${colors.borderDefault}`,
            borderRadius: '8px',
            color: colors.textPrimary,
            fontSize: '13px',
          }}
        />
      </RadarChart>
    </ResponsiveContainer>
  )
}
