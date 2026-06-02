import { useMemo, useState } from 'react'
import { Coins, Trash2 } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, CartesianGrid } from 'recharts'
import { ChartCard } from '@/components/stats/ChartCard'
import { getTokenUsage, clearTokenUsage, type TokenUsageEntry } from '@/services/tokenUsageService'

type Period = 'today' | 'week' | 'month' | 'all'

interface ModelPreset {
  label: string
  inputPerM: number
  outputPerM: number
}

const MODEL_PRESETS: ModelPreset[] = [
  { label: 'GPT-4o', inputPerM: 2.50, outputPerM: 10.00 },
  { label: 'GPT-4o-mini', inputPerM: 0.15, outputPerM: 0.60 },
  { label: 'Claude 3.5 Sonnet', inputPerM: 3.00, outputPerM: 15.00 },
  { label: 'Claude 3 Haiku', inputPerM: 0.25, outputPerM: 1.25 },
  { label: 'DeepSeek V3', inputPerM: 0.27, outputPerM: 1.10 },
]

const PERIODS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'all', label: 'All Time' },
]

const FEATURE_LABELS: Record<string, string> = {
  quiz: 'Quiz Generation',
  grade: 'Answer Grading',
  'study-plan': 'Study Plan',
  summary: 'Document Summary',
  evaluation: 'Accuracy Evaluation',
  concept: 'Concept Extraction',
  chat: 'Document Chat',
  explain: 'Concept Explanation',
  script: 'Presentation Script',
  translate: 'Translation',
  inception: 'Inception Summary',
  'follow-up': 'Follow-up Suggestions',
}

function periodStart(p: Period): number {
  const now = new Date()
  if (p === 'today') {
    now.setHours(0, 0, 0, 0)
    return now.getTime()
  }
  if (p === 'week') {
    const day = now.getDay() || 7
    now.setDate(now.getDate() - day + 1)
    now.setHours(0, 0, 0, 0)
    return now.getTime()
  }
  if (p === 'month') {
    now.setDate(1)
    now.setHours(0, 0, 0, 0)
    return now.getTime()
  }
  return 0
}

function formatNum(n: number): string {
  return n.toLocaleString()
}

function fmtCost(n: number): string {
  if (n < 0.01) return '< $0.01'
  return `$${n.toFixed(2)}`
}

export function TokenStatsPage() {
  const allEntries = useMemo(() => getTokenUsage(), [])
  const [period, setPeriod] = useState<Period>('all')
  const [modelIdx, setModelIdx] = useState(0)
  const [, setRefresh] = useState(0)
  const model = MODEL_PRESETS[modelIdx]

  const filtered = useMemo(
    () => allEntries.filter(e => e.timestamp >= periodStart(period)),
    [allEntries, period],
  )

  // Overview stats
  const overview = useMemo(() => {
    let totalCalls = 0
    let promptTokens = 0
    let completionTokens = 0
    for (const e of filtered) {
      totalCalls++
      promptTokens += e.promptTokens
      completionTokens += e.completionTokens
    }
    return { totalCalls, promptTokens, completionTokens, totalTokens: promptTokens + completionTokens }
  }, [filtered])

  const estimatedCost = useMemo(() => {
    return (overview.promptTokens / 1_000_000) * model.inputPerM
      + (overview.completionTokens / 1_000_000) * model.outputPerM
  }, [overview, model])

  // Cost by feature (bar chart)
  const costByFeature = useMemo(() => {
    const map = new Map<string, { prompt: number; completion: number }>()
    for (const e of filtered) {
      const existing = map.get(e.feature) ?? { prompt: 0, completion: 0 }
      existing.prompt += e.promptTokens
      existing.completion += e.completionTokens
      map.set(e.feature, existing)
    }
    return Array.from(map.entries())
      .map(([feature, { prompt, completion }]) => ({
        feature: FEATURE_LABELS[feature] || feature,
        cost: (prompt / 1_000_000) * model.inputPerM + (completion / 1_000_000) * model.outputPerM,
        promptTokens: prompt,
        completionTokens: completion,
      }))
      .sort((a, b) => b.cost - a.cost)
  }, [filtered, model])

  // Daily trend (area chart) — last 30 days
  const dailyTrend = useMemo(() => {
    const map = new Map<string, { date: string; tokens: number; calls: number }>()
    const now = new Date()
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      map.set(key, { date: d.toLocaleDateString('en', { month: 'short', day: 'numeric' }), tokens: 0, calls: 0 })
    }
    for (const e of filtered) {
      const key = new Date(e.timestamp).toISOString().slice(0, 10)
      if (map.has(key)) {
        const entry = map.get(key)!
        entry.tokens += e.totalTokens
        entry.calls++
      }
    }
    return Array.from(map.values())
  }, [filtered])

  const handleClear = () => {
    clearTokenUsage()
    setRefresh(v => v + 1)
  }

  return (
    <div className="cs-settings">
      <div className="cs-settings-header">
        <div className="cs-section-label">TOKEN USAGE</div>
        <h1>Token Statistics</h1>
        <p className="cs-settings-subtitle">Track AI token consumption and estimate costs for commercial LLMs.</p>
      </div>

      {/* Period selector */}
      <div className="cs-btn-group" style={{ marginBottom: '1.25rem' }}>
        {PERIODS.map(p => (
          <button
            key={p.key}
            className={`cs-btn ${period === p.key ? 'cs-btn-primary' : 'cs-btn-secondary'}`}
            onClick={() => setPeriod(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Overview cards */}
      <div className="cs-stats-grid-2" style={{ marginBottom: '1rem' }}>
        <div className="cs-card">
          <div className="cs-card-body" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '0.25rem' }}>Total Calls</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>{formatNum(overview.totalCalls)}</div>
          </div>
        </div>
        <div className="cs-card">
          <div className="cs-card-body" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '0.25rem' }}>Total Tokens</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>{formatNum(overview.totalTokens)}</div>
          </div>
        </div>
      </div>
      <div className="cs-stats-grid-2" style={{ marginBottom: '1rem' }}>
        <div className="cs-card">
          <div className="cs-card-body" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '0.25rem' }}>Prompt Tokens</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{formatNum(overview.promptTokens)}</div>
          </div>
        </div>
        <div className="cs-card">
          <div className="cs-card-body" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '0.25rem' }}>Completion Tokens</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{formatNum(overview.completionTokens)}</div>
          </div>
        </div>
      </div>

      {/* Model preset + estimated cost */}
      <ChartCard
        title="Estimated Cost"
        extra={
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <select
              value={modelIdx}
              onChange={e => setModelIdx(Number(e.target.value))}
              style={{
                padding: '0.25rem 0.5rem',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--card-bg)',
                color: 'var(--text-primary)',
                fontSize: '0.8rem',
              }}
            >
              {MODEL_PRESETS.map((m, i) => (
                <option key={m.label} value={i}>{m.label}</option>
              ))}
            </select>
            <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent-green)' }}>
              {fmtCost(estimatedCost)}
            </span>
          </div>
        }
      >
        <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
          Input: ${model.inputPerM}/M tokens &middot; Output: ${model.outputPerM}/M tokens
        </div>
      </ChartCard>

      {/* Charts */}
      <div className="cs-stats-grid-2">
        <ChartCard title="Cost by Feature">
          <div style={{ height: 260 }}>
            {costByFeature.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={costByFeature} margin={{ top: 5, right: 10, left: 0, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="feature"
                    tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
                    angle={-35}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} width={50} />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--card-bg)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(value: any) => [fmtCost(Number(value)), 'Cost']}
                  />
                  <Bar dataKey="cost" fill="var(--accent-blue)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="cs-empty-hint">No usage data yet</div>
            )}
          </div>
        </ChartCard>

        <ChartCard title="Daily Trend (Last 30 Days)">
          <div style={{ height: 260 }}>
            {filtered.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyTrend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} width={50} />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--card-bg)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(value: any, name: any) => [
                      name === 'tokens' ? formatNum(Number(value)) : value,
                      name === 'tokens' ? 'Tokens' : 'Calls',
                    ]}
                  />
                  <Area type="monotone" dataKey="tokens" stroke="var(--accent-blue)" fill="var(--accent-blue)" fillOpacity={0.15} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="cs-empty-hint">No usage data yet</div>
            )}
          </div>
        </ChartCard>
      </div>

      {/* Usage log table */}
      <ChartCard
        title="Usage Log"
        extra={
          filtered.length > 0 && (
            <button className="cs-btn cs-btn-secondary" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }} onClick={handleClear}>
              <Trash2 size={12} style={{ marginRight: 4 }} />
              Clear All
            </button>
          )
        }
      >
        {filtered.length === 0 ? (
          <div className="cs-empty-hint">No AI calls recorded yet. Usage will appear after performing AI-powered features.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-tertiary)' }}>
                  <th style={{ padding: '0.5rem', textAlign: 'left', fontWeight: 500 }}>Feature</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 500 }}>Prompt</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 500 }}>Completion</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 500 }}>Total</th>
                  <th style={{ padding: '0.5rem', textAlign: 'center', fontWeight: 500 }}>Est.</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 500 }}>Time</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 50).map(e => (
                  <tr key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.4rem 0.5rem' }}>{FEATURE_LABELS[e.feature] || e.feature}</td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>{formatNum(e.promptTokens)}</td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right' }}>{formatNum(e.completionTokens)}</td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', fontWeight: 600 }}>{formatNum(e.totalTokens)}</td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'center', color: e.estimated ? 'var(--text-tertiary)' : 'var(--accent-green)' }}>
                      {e.estimated ? 'Yes' : 'No'}
                    </td>
                    <td style={{ padding: '0.4rem 0.5rem', textAlign: 'right', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                      {new Date(e.timestamp).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length > 50 && (
              <div style={{ textAlign: 'center', padding: '0.5rem', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                Showing 50 of {filtered.length} entries
              </div>
            )}
          </div>
        )}
      </ChartCard>
    </div>
  )
}
