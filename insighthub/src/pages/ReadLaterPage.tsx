import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bookmark, Search, FileText, X, ArrowLeft } from 'lucide-react'
import { useDocumentStore } from '@/stores/documentStore'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { storageService } from '@/services/storageService'
import { getCategoryInfo } from '@/utils/categoryMap'
import type { Source } from '@/types'

const SOURCE_SHORT: Record<Source, string> = {
  mindinsight: 'Mind',
  techinsight: 'Tech',
  leetcodeinsight: 'LC',
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function ReadLaterPage() {
  const navigate = useNavigate()
  const documents = useDocumentStore(s => s.documents)
  const activeWorkspace = usePreferenceStore(s => s.activeWorkspace)
  const [searchQuery, setSearchQuery] = useState('')
  const [list, setList] = useState(() => storageService.getReadLaterList())

  // Refresh list on storage events (e.g. from DocReaderPage)
  useEffect(() => {
    const refresh = () => setList(storageService.getReadLaterList())
    window.addEventListener('storage', refresh)
    return () => window.removeEventListener('storage', refresh)
  }, [])

  const items = useMemo(() => {
    return list
      .filter(item => {
        const doc = documents.get(item.documentId)
        if (!doc) return false
        if (doc.source !== activeWorkspace) return false
        if (!searchQuery.trim()) return true
        const q = searchQuery.toLowerCase()
        return doc.title.toLowerCase().includes(q)
      })
      .map(item => ({
        ...item,
        doc: documents.get(item.documentId)!,
        catInfo: getCategoryInfo(documents.get(item.documentId)!.category),
      }))
      .sort((a, b) => b.addedAt - a.addedAt)
  }, [list, searchQuery, documents])

  const handleRemove = (documentId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    storageService.removeFromReadLater(documentId)
    setList(storageService.getReadLaterList())
    window.dispatchEvent(new Event('storage'))
  }

  return (
    <div className="page-read-later">
      <div className="stats-page-header">
        <div className="page-header-row">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)} title="返回">
            <ArrowLeft size={18} />
          </button>
          <h1 className="stats-page-title">
            <Bookmark size={22} style={{ marginRight: 8, verticalAlign: 'middle' }} />
            稍后阅读
          </h1>
        </div>
        <p className="stats-page-desc">标记的文档会自动恢复上次的阅读位置</p>
      </div>

      {list.length === 0 ? (
        <div className="empty-state">
          <Bookmark size={48} />
          <h3>暂无稍后阅读的文档</h3>
          <p>在文档阅读页面点击书签按钮，可将文档添加到此处</p>
        </div>
      ) : (
        <>
          <div className="filter-bar">
            <div className="filter-group">
              <span className="badge" style={{ fontSize: '0.8rem' }}>
                {items.length} 篇文档
              </span>
            </div>
            <div className="search-page-input-wrap" style={{ flex: '1 1 240px', minWidth: 200 }}>
              <Search size={16} />
              <input
                type="search"
                className="search-page-input"
                placeholder="搜索文档..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {items.length === 0 ? (
            <div className="empty-state" style={{ padding: '3rem 2rem' }}>
              <Search size={40} />
              <h3>未找到匹配的文档</h3>
            </div>
          ) : (
            <div className="read-later-list">
              {items.map(item => (
                <div
                  key={item.documentId}
                  className="read-later-item card"
                  onClick={() =>
                    navigate(`/doc/${item.documentId}`, { state: { from: '/read-later' } })
                  }
                >
                  <div className="read-later-item-header">
                    <span className="read-later-item-title">
                      <FileText size={14} />
                      {item.doc.title}
                    </span>
                    <span className={`badge badge-${item.doc.source}`}>
                      {SOURCE_SHORT[item.doc.source as Source] ?? 'Doc'}
                    </span>
                    {item.catInfo && <span className="badge">{item.catInfo.label}</span>}
                    <span className="read-later-item-time">{formatTime(item.addedAt)}</span>
                    <button
                      className="btn btn-ghost btn-sm read-later-remove-btn"
                      onClick={e => handleRemove(item.documentId, e)}
                      title="移除"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="read-later-item-meta">
                    <span>{item.doc.wordCount.toLocaleString()} 字</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
