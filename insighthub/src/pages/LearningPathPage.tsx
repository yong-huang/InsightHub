import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { useDocumentStore } from '@/stores/documentStore'
import { buildPathData } from '@/utils/pathBuilder'
import { ChartCard } from '@/components/stats/ChartCard'
import { LearningPath } from '@/components/visualization/LearningPath'

export function LearningPathPage() {
  const navigate = useNavigate()
  const activeWorkspace = usePreferenceStore(s => s.activeWorkspace)
  const documents = useDocumentStore(s => s.documents)
  const pathData = useMemo(() => buildPathData(documents, activeWorkspace), [documents, activeWorkspace])

  return (
    <div className="viz-page">
      <div className="viz-page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} title="返回">
            <ArrowLeft size={18} />
          </button>
          <h1 className="viz-page-title">学习路径</h1>
        </div>
        <p className="viz-page-desc">追踪各分类的学习进度，发现下一步学习方向</p>
      </div>

      <ChartCard title={`${activeWorkspace === 'mindinsight' ? 'MindInsight' : 'TechInsight'} 学习路径`}>
        <LearningPath data={pathData} source={activeWorkspace} />
      </ChartCard>
    </div>
  )
}
