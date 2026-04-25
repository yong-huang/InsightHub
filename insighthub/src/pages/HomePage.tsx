import { Link } from 'react-router-dom'
import {
  BookOpen, CheckCircle2, Circle, Layers, ArrowRight, Clock,
} from 'lucide-react'
import { useDocumentStore } from '@/stores/documentStore'
import { useTagStore } from '@/stores/tagStore'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { StatCard } from '@/components/shared/StatCard'
import { DocCard } from '@/components/shared/DocCard'
import { getCategoriesBySource, WORKSPACE_META } from '@/utils/categoryMap'
import { useReveal } from '@/hooks/useReveal'

export function HomePage() {
  const documents = useDocumentStore(s => s.documents)
  const categoryCounts = useDocumentStore(s => s.categoryCounts)
  const getRecentReads = useDocumentStore(s => s.getRecentReads)
  const tags = useTagStore(s => s.tags)
  const activeWorkspace = usePreferenceStore(s => s.activeWorkspace)
  const ref1 = useReveal()
  const ref2 = useReveal()
  const ref3 = useReveal()
  const ref4 = useReveal()

  const meta = WORKSPACE_META[activeWorkspace]
  const workspaceDocs = Array.from(documents.values()).filter(d => d.source === activeWorkspace)
  const workspaceCategories = getCategoriesBySource(activeWorkspace)
  const recentReads = getRecentReads().filter(d => d.source === activeWorkspace).slice(0, 10)

  // Compute stats scoped to workspace
  const stats = {
    total: workspaceDocs.length,
    read: workspaceDocs.filter(d => d.isRead).length,
    unread: workspaceDocs.filter(d => !d.isRead).length,
    categories: new Set(workspaceDocs.map(d => d.category)).size,
  }

  // Filter tags to only those with docs in current workspace
  const workspaceDocIds = new Set(workspaceDocs.map(d => d.id))
  const workspaceTags = tags
    .map(tag => ({
      ...tag,
      documentIds: tag.documentIds.filter(id => workspaceDocIds.has(id)),
    }))
    .filter(tag => tag.documentIds.length > 0)

  return (
    <div className="page-home">
      {/* Stats Row */}
      <div className="home-stats reveal" ref={ref1}>
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
        <div className="section reveal reveal-delay-1" ref={ref2}>
          <div className="section-header">
            <h2><Clock size={20} /> Recent Reads</h2>
            <Link to="/search" className="btn btn-ghost btn-sm">View All <ArrowRight size={14} /></Link>
          </div>
          <div className="recent-reads-grid">
            {recentReads.map(doc => (
              <DocCard key={doc.id} doc={doc} />
            ))}
          </div>
        </div>
      )}

      {/* Workspace Categories */}
      <div className="section reveal reveal-delay-2" ref={ref3}>
        <div className="home-category-grid">
          {workspaceCategories.map(cat => {
            const docs = workspaceDocs
              .filter(d => d.category === cat.key)
              .slice(0, 3)
            return (
              <div key={cat.key} className="card">
                <div className="section-header">
                  <h2>{cat.label}</h2>
                  <Link to={`${meta.basePath}/${cat.key}`} className="btn btn-ghost btn-sm">
                    {categoryCounts[cat.key] || 0} docs <ArrowRight size={14} />
                  </Link>
                </div>
                {docs.map(doc => (
                  <DocCard key={doc.id} doc={doc} />
                ))}
              </div>
            )
          })}
        </div>
      </div>

      {/* Hot Tags */}
      {workspaceTags.length > 0 && (
        <div className="section reveal reveal-delay-4" ref={ref4}>
          <div className="section-header">
            <h2>Popular Tags</h2>
          </div>
          <div className="tag-list">
            {workspaceTags
              .sort((a, b) => b.documentIds.length - a.documentIds.length)
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
      )}
    </div>
  )
}
