import { useNavigate } from 'react-router-dom'
import {
  GraduationCap, Film, BookOpen, Brain,
  Cpu, GitBranch, Cloud, Server, Network, Code, Code2,
  TrendingUp, Landmark, BarChart3, Monitor, Briefcase,
  Sparkles, Layers, Type, Link, Archive, Calculator, Puzzle, Search, FileText,
} from 'lucide-react'
import { WORKSPACE_META } from '@/utils/categoryMap'
import type { PathData, PathMilestone } from '@/utils/pathBuilder'
import type { Source } from '@/types'

interface Props {
  data: PathData
  source: Source
}

const ICON_MAP: Record<string, React.ReactNode> = {
  GraduationCap: <GraduationCap size={16} />,
  Film: <Film size={16} />,
  TrendingUp: <TrendingUp size={16} />,
  Landmark: <Landmark size={16} />,
  BookOpen: <BookOpen size={16} />,
  Brain: <Brain size={16} />,
  Cpu: <Cpu size={16} />,
  GitBranch: <GitBranch size={16} />,
  Cloud: <Cloud size={16} />,
  Server: <Server size={16} />,
  Network: <Network size={16} />,
  Code: <Code size={16} />,
  Code2: <Code2 size={16} />,
  BarChart3: <BarChart3 size={16} />,
  Monitor: <Monitor size={16} />,
  Briefcase: <Briefcase size={16} />,
  Layers: <Layers size={16} />,
  Type: <Type size={16} />,
  Link: <Link size={16} />,
  Archive: <Archive size={16} />,
  Calculator: <Calculator size={16} />,
  Puzzle: <Puzzle size={16} />,
  Search: <Search size={16} />,
  FileText: <FileText size={16} />,
}

const SOURCE_BAR_CLASS: Record<string, string> = {
  mindinsight: 'lp-overall-bar-mind',
  techinsight: 'lp-overall-bar-tech',
  leetcodeinsight: 'lp-overall-bar-leetc',
}

function getStatus(milestone: PathMilestone): 'completed' | 'in-progress' | 'not-started' {
  if (milestone.progress >= 1) return 'completed'
  if (milestone.progress > 0) return 'in-progress'
  return 'not-started'
}

function MilestoneCard({ milestone, navigate }: { milestone: PathMilestone; navigate: ReturnType<typeof useNavigate> }) {
  const status = getStatus(milestone)
  const cls = milestone.isNextRecommended ? 'recommended' : status

  const meta = WORKSPACE_META[milestone.source]
  const basePath = meta.basePath

  return (
    <div
      className={`lp-milestone ${cls}`}
      onClick={() => navigate(`${basePath}/${milestone.categoryKey}`)}
    >
      <div className="lp-dot-area">
        <div className="lp-dot" />
        {status !== 'not-started' && <div className="lp-line" />}
      </div>
      <div className="lp-card">
        <div className="lp-card-header">
          <span className="lp-card-icon">{ICON_MAP[milestone.icon]}</span>
          <span className="lp-card-name">{milestone.label}</span>
          {milestone.isNextRecommended && (
            <span className="lp-recommend-badge">
              <Sparkles size={12} /> Recommended
            </span>
          )}
          <span className="lp-card-source">{meta.label}</span>
        </div>
        <div className="lp-progress-bar">
          <div
            className="lp-progress-fill"
            style={{ width: `${Math.round(milestone.progress * 100)}%` }}
          />
        </div>
        <div className="lp-card-count">
          {milestone.readCount} / {milestone.totalCount} docs · {Math.round(milestone.progress * 100)}%
        </div>
      </div>
    </div>
  )
}

export function LearningPath({ data, source }: Props) {
  const navigate = useNavigate()
  const milestones = data[source]
  const meta = WORKSPACE_META[source]
  const overallPct = milestones.length > 0
    ? Math.round(milestones.reduce((s, m) => s + m.progress, 0) / milestones.length * 100)
    : 0

  return (
    <div>
      {/* Overall progress */}
      <div className="lp-overall-progress">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Overall Progress</span>
          <span className="lp-overall-pct">{overallPct}%</span>
        </div>
        <div className="lp-overall-bar">
          <div
            className={SOURCE_BAR_CLASS[source] || 'lp-overall-bar-tech'}
            style={{ width: `${overallPct}%` }}
          />
        </div>
      </div>

      {/* Milestones */}
      <div className="lp-timeline">
        {milestones.map(m => (
          <MilestoneCard key={m.categoryKey} milestone={m} navigate={navigate} />
        ))}
      </div>
    </div>
  )
}
