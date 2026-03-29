import { Link } from 'react-router-dom'
import {
  BookOpen, CheckCircle2, Circle, Layers, ArrowRight, Clock,
} from 'lucide-react'
import { useDocumentStore } from '@/stores/documentStore'
import { useTagStore } from '@/stores/tagStore'
import { StatCard } from '@/components/shared/StatCard'
import { DocCard } from '@/components/shared/DocCard'
import { CATEGORIES, getCategoriesBySource, getCategoryInfo } from '@/utils/categoryMap'
import { useReveal } from '@/hooks/useReveal'

export function HomePage() {
  const stats = useDocumentStore(s => s.stats)
  const getRecentReads = useDocumentStore(s => s.getRecentReads)
  const documents = useDocumentStore(s => s.documents)
  const categoryCounts = useDocumentStore(s => s.categoryCounts)
  const tags = useTagStore(s => s.tags)
  const ref1 = useReveal()
  const ref2 = useReveal()
  const ref3 = useReveal()

  const recentReads = getRecentReads()
  const miCategories = getCategoriesBySource('mindinsight')
  const tiCategories = getCategoriesBySource('techinsight')

  return (
    <div className="page-home">
      {/* Stats Row */}
      <div className="home-stats reveal" ref={ref1}>
        <StatCard
          icon={<BookOpen size={22} />}
          label="总文档数"
          value={stats.total}
          color="var(--accent-blue)"
        />
        <StatCard
          icon={<CheckCircle2 size={22} />}
          label="已阅读"
          value={stats.read}
          color="var(--accent-green)"
        />
        <StatCard
          icon={<Circle size={22} />}
          label="未阅读"
          value={stats.unread}
          color="var(--accent-orange)"
        />
        <StatCard
          icon={<Layers size={22} />}
          label="分类数"
          value={stats.categories}
          color="var(--accent-purple)"
        />
      </div>

      {/* Recent Reads */}
      {recentReads.length > 0 && (
        <div className="section reveal reveal-delay-1" ref={ref2}>
          <div className="section-header">
            <h2><Clock size={20} /> 最近阅读</h2>
            <Link to="/search" className="btn btn-ghost btn-sm">查看全部 <ArrowRight size={14} /></Link>
          </div>
          <div className="recent-reads-grid">
            {recentReads.map(doc => (
              <DocCard key={doc.id} doc={doc} />
            ))}
          </div>
        </div>
      )}

      {/* MindInsight */}
      <div className="section reveal reveal-delay-2" ref={ref3}>
        <div className="section-header">
          <h2 className="gradient-text-warm">MindInsight · 思想洞察</h2>
          <Link to="/mindinsight" className="btn btn-ghost btn-sm">
            查看全部 <ArrowRight size={14} />
          </Link>
        </div>
        <div className="home-category-grid">
          {miCategories.map(cat => {
            const docs = Array.from(documents.values()).filter(
              d => d.category === cat.key
            ).slice(0, 3)
            return (
              <div key={cat.key} className="card">
                <div className="section-header">
                  <h2>{cat.label}</h2>
                  <Link to={`/mindinsight/${cat.key}`} className="btn btn-ghost btn-sm">
                    {categoryCounts[cat.key] || 0} 篇 <ArrowRight size={14} />
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

      {/* TechInsight */}
      <div className="section reveal reveal-delay-3">
        <div className="section-header">
          <h2 className="gradient-text">TechInsight · 技术洞察</h2>
          <Link to="/techinsight" className="btn btn-ghost btn-sm">
            查看全部 <ArrowRight size={14} />
          </Link>
        </div>
        <div className="home-category-grid">
          {tiCategories.map(cat => {
            const docs = Array.from(documents.values()).filter(
              d => d.category === cat.key
            ).slice(0, 3)
            return (
              <div key={cat.key} className="card">
                <div className="section-header">
                  <h2>{cat.label}</h2>
                  <Link to={`/techinsight/${cat.key}`} className="btn btn-ghost btn-sm">
                    {categoryCounts[cat.key] || 0} 篇 <ArrowRight size={14} />
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
      {tags.length > 0 && (
        <div className="section reveal reveal-delay-4">
          <div className="section-header">
            <h2>热门标签</h2>
          </div>
          <div className="tag-list">
            {tags
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
