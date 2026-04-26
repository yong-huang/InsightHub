import { useNavigate } from 'react-router-dom'
import {
  GraduationCap, Film, BookOpen, Brain,
  Cpu, GitBranch, Cloud, Server, Network, Code, Code2,
  TrendingUp, Landmark, BarChart3, Monitor, Briefcase,
  Sparkles, Layers, Type, Link, Archive, Calculator, Puzzle, Search, FileText,
  TerminalSquare, Building2, Terminal, Container, Wifi, HardDrive, Database, Undo2, Binary,
} from 'lucide-react'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { getWorkspaceConfig, getSourceColor } from '@/utils/workspaceUtils'
import type { PathData, PathMilestone } from '@/utils/pathBuilder'
import type { Source, WorkspaceConfig } from '@/types'

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
  TerminalSquare: <TerminalSquare size={16} />,
  Building2: <Building2 size={16} />,
  Terminal: <Terminal size={16} />,
  Container: <Container size={16} />,
  Wifi: <Wifi size={16} />,
  HardDrive: <HardDrive size={16} />,
  Database: <Database size={16} />,
  Undo2: <Undo2 size={16} />,
  Binary: <Binary size={16} />,
}

function getStatus(milestone: PathMilestone): 'completed' | 'in-progress' | 'not-started' {
  if (milestone.progress >= 1) return 'completed'
  if (milestone.progress > 0) return 'in-progress'
  return 'not-started'
}

function MilestoneRow({ milestone, workspaces, navigate }: { milestone: PathMilestone; workspaces: WorkspaceConfig[]; navigate: ReturnType<typeof useNavigate> }) {
  const status = getStatus(milestone)
  const cls = milestone.isNextRecommended ? 'recommended' : status
  const meta = getWorkspaceConfig(milestone.source, workspaces)
  const basePath = meta ? `/${meta.id}` : ''

  return (
    <div
      className={`cs-model-item cs-milestone ${cls}`}
      onClick={() => navigate(`${basePath}/${milestone.categoryKey}`)}
    >
      <div className={`cs-status-dot ${cls}`} />
      <div className="cs-model-info">
        <div className="cs-model-name">
          {ICON_MAP[milestone.icon]}
          {milestone.label}
          {milestone.isNextRecommended && (
            <span className="cs-badge cs-badge-recommended">
              <Sparkles size={10} /> Recommended
            </span>
          )}
        </div>
        <div className="cs-model-meta">
          <span>{milestone.readCount} / {milestone.totalCount} docs</span>
          <span>{Math.round(milestone.progress * 100)}%</span>
          <span>{meta?.label || milestone.source}</span>
        </div>
        <div className="cs-progress-bar">
          <div className="cs-progress-fill" style={{ width: `${Math.round(milestone.progress * 100)}%` }} />
        </div>
      </div>
    </div>
  )
}

export function LearningPath({ data, source }: Props) {
  const navigate = useNavigate()
  const workspaces = usePreferenceStore(s => s.workspaces)
  const milestones = data.workspaces[source] || []
  const sourceColor = getSourceColor(source, workspaces)
  const overallPct = milestones.length > 0
    ? Math.round(milestones.reduce((s, m) => s + m.progress, 0) / milestones.length * 100)
    : 0

  return (
    <div>
      {/* Overall progress */}
      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Overall Progress</span>
          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--accent-blue)' }}>{overallPct}%</span>
        </div>
        <div style={{ height: '8px', borderRadius: '4px', overflow: 'hidden', background: 'var(--bg-input)' }}>
          <div style={{ height: '100%', borderRadius: '4px', width: `${overallPct}%`, background: sourceColor, transition: 'width 0.5s ease' }} />
        </div>
      </div>

      {/* Milestone list */}
      <div className="cs-item-list">
        {milestones.map(m => (
          <MilestoneRow key={m.categoryKey} milestone={m} workspaces={workspaces} navigate={navigate} />
        ))}
      </div>
    </div>
  )
}
