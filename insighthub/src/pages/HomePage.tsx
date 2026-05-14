import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  BookOpen, CheckCircle2, Circle, Layers, ArrowRight, Clock,
} from 'lucide-react'
import { useDocumentStore } from '@/stores/documentStore'
import { useTagStore } from '@/stores/tagStore'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { StatCard } from '@/components/shared/StatCard'
import { DocCard } from '@/components/shared/DocCard'
import { useDynamicCategories } from '@/hooks/useDynamicCategories'
import { getWorkspaceConfig } from '@/utils/workspaceUtils'

export function HomePage() {
  const documents = useDocumentStore(s => s.documents)
  const getRecentReads = useDocumentStore(s => s.getRecentReads)
  const tags = useTagStore(s => s.tags)
  const activeWorkspace = usePreferenceStore(s => s.activeWorkspace)
  const workspaces = usePreferenceStore(s => s.workspaces)

  const meta = getWorkspaceConfig(activeWorkspace, workspaces)
  const workspaceCategories = useDynamicCategories(activeWorkspace)
  const recentReads = useMemo(
    () => getRecentReads().filter(d => d.source === activeWorkspace).slice(0, 10),
    [getRecentReads, activeWorkspace],
  )

  // Single-pass: compute stats + build docId set + category set
  const { stats, workspaceDocIds, workspaceTags } = useMemo(() => {
    const docIds = new Set<string>()
    const cats = new Set<string>()
    let readCount = 0
    for (const doc of documents.values()) {
      if (doc.source !== activeWorkspace) continue
      docIds.add(doc.id)
      cats.add(doc.category)
      if (doc.isRead) readCount++
    }
    const s = {
      total: docIds.size,
      read: readCount,
      unread: docIds.size - readCount,
      categories: cats.size,
    }
    const wsTags = tags
      .map(tag => ({
        ...tag,
        documentIds: tag.documentIds.filter(id => docIds.has(id)),
      }))
      .filter(tag => tag.documentIds.length > 0)
      .sort((a, b) => b.documentIds.length - a.documentIds.length)
    return { stats: s, workspaceDocIds: docIds, workspaceTags: wsTags }
  }, [documents, activeWorkspace, tags])

  const workspaceDocs = useMemo(
    () => Array.from(documents.values()).filter(d => d.source === activeWorkspace),
    [documents, activeWorkspace],
  )

  return (
    <div className="cs-settings">
      <div className="cs-settings-header">
        <div className="cs-section-label">{meta?.label?.toUpperCase() || 'DASHBOARD'}</div>
        <h1>Dashboard</h1>
        <p className="cs-settings-subtitle">Overview of your learning documents and progress</p>
      </div>

      {/* Stats Row */}
      <div className="home-stats">
        <StatCard
          icon={<BookOpen size={22} />}
          label="Total Documents"
          value={stats.total}
          color="var(--accent-blue)"
        />
        <StatCard
          icon={<CheckCircle2 size={22} />}
          label="Read"
          value={stats.read}
          color="var(--accent-green)"
        />
        <StatCard
          icon={<Circle size={22} />}
          label="Unread"
          value={stats.unread}
          color="var(--accent-orange)"
        />
        <StatCard
          icon={<Layers size={22} />}
          label="Categories"
          value={stats.categories}
          color="var(--accent-purple)"
        />
      </div>

      {/* Recent Reads */}
      {recentReads.length > 0 && (
        <div className="cs-card">
          <div className="cs-card-header">
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Clock size={14} /> RECENT READS
            </span>
            <Link to="/search" className="cs-btn cs-btn-secondary" style={{ marginLeft: 'auto', padding: '4px 12px', fontSize: '0.75rem' }}>
              View All <ArrowRight size={12} />
            </Link>
          </div>
          <div className="cs-card-body">
            <div className="recent-reads-grid">
              {recentReads.map(doc => (
                <DocCard key={doc.id} doc={doc} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Workspace Categories */}
      <div className="home-category-grid">
        {workspaceCategories.map(cat => {
          const docs = workspaceDocs
            .filter(d => d.category === cat.key)
            .slice(0, 3)
          return (
            <div key={cat.key} className="cs-card">
              <div className="cs-card-header">
                <span>{cat.label.toUpperCase()}</span>
                <Link
                  to={`/${activeWorkspace}/${cat.key}`}
                  className="cs-btn cs-btn-secondary"
                  style={{ marginLeft: 'auto', padding: '4px 12px', fontSize: '0.75rem' }}
                >
                  {cat.docCount} docs <ArrowRight size={12} />
                </Link>
              </div>
              <div className="cs-card-body">
                {docs.map(doc => (
                  <DocCard key={doc.id} doc={doc} />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Hot Tags */}
      {workspaceTags.length > 0 && (
        <div className="cs-card">
          <div className="cs-card-header">POPULAR TAGS</div>
          <div className="cs-card-body">
            <div className="tag-list">
              {workspaceTags
                .slice(0, 15)
                .map(tag => (
                  <Link
                    key={tag.id}
                    to={`/tag/${tag.id}`}
                    className="tag-pill"
                    style={{ background: `${tag.color}20`, color: tag.color }}
                  >
                    {tag.name}
                    <span style={{ opacity: 0.7 }}>{tag.documentIds.length}</span>
                  </Link>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
