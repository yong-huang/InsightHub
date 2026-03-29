import { useEffect, useState, useMemo, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, CheckCircle2, Circle, BookOpen, FileText,
  Sparkles, Plus, X, Maximize, Minimize,
} from 'lucide-react'
import { useDocumentStore } from '@/stores/documentStore'
import { useTagStore } from '@/stores/tagStore'
import { getCategoryInfo } from '@/utils/categoryMap'
import { useDocumentUrl } from '@/hooks/useDocumentUrl'

export function DocReaderPage() {
  const { docId } = useParams<{ docId: string }>()
  const navigate = useNavigate()
  const doc = useDocumentStore(s => s.documents.get(docId || ''))
  const markAsRead = useDocumentStore(s => s.markAsRead)
  const toggleRead = useDocumentStore(s => s.toggleRead)
  const url = useDocumentUrl(docId || '')

  const [autoReadTimer, setAutoReadTimer] = useState<number | null>(null)
  const [showTagInput, setShowTagInput] = useState(false)
  const [tagName, setTagName] = useState('')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  const toggleFullscreen = () => {
    if (!iframeRef.current) return
    if (!document.fullscreenElement) {
      iframeRef.current.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }

  const allTags = useTagStore(s => s.tags)
  const addTag = useTagStore(s => s.addTag)
  const addDocumentToTag = useTagStore(s => s.addDocumentToTag)

  const tags = useMemo(
    () => allTags.filter(t => t.documentIds.includes(docId || '')),
    [allTags, docId]
  )

  const catInfo = doc ? getCategoryInfo(doc.category) : null

  useEffect(() => {
    if (doc && !doc.isRead) {
      const timer = window.setTimeout(() => {
        markAsRead(doc.id)
        setAutoReadTimer(null)
      }, 30000)
      setAutoReadTimer(timer)
      return () => {
        if (timer) clearTimeout(timer)
      }
    }
  }, [doc?.id])

  if (!doc) {
    return (
      <div className="empty-state">
        <BookOpen size={48} />
        <h3>文档未找到</h3>
        <button className="btn btn-primary" onClick={() => navigate('/')}>
          返回首页
        </button>
      </div>
    )
  }

  const handleAddTag = () => {
    if (!tagName.trim() || !docId) return
    const existingTag = useTagStore.getState().tags.find(t => t.name === tagName.trim())
    if (existingTag) {
      addDocumentToTag(existingTag.id, doc.id)
    } else {
      addTag(tagName.trim(), doc.id)
    }
    setTagName('')
    setShowTagInput(false)
  }

  return (
    <div className="doc-reader-page">
      {/* Toolbar */}
      <div className="doc-reader-toolbar">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} /> 返回
        </button>

        <div className="doc-reader-toolbar-info">
          <span className={`badge badge-${doc.source}`}>
            {doc.source === 'mindinsight' ? 'Mind' : 'Tech'}
          </span>
          {catInfo && <span className="badge">{catInfo.label}</span>}
          <span className="badge">
            <FileText size={12} />
            {doc.wordCount.toLocaleString()} 字
          </span>
        </div>

        <div className="doc-reader-toolbar-actions">
          {doc.isRead ? (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => toggleRead(doc.id)}
            >
              <CheckCircle2 size={14} /> 取消已读
            </button>
          ) : (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => markAsRead(doc.id)}
            >
              <CheckCircle2 size={14} /> 标记已读
            </button>
          )}

          {autoReadTimer && (
            <span className="badge badge-unread" style={{ fontSize: '0.7rem' }}>
              30s 后自动标记已读
            </span>
          )}

          <Link
            to={`/quiz/new?docId=${doc.id}`}
            className="btn btn-primary btn-sm"
          >
            <Sparkles size={14} /> 生成测验
          </Link>

          <button
            className="btn btn-ghost btn-sm"
            onClick={toggleFullscreen}
            title={isFullscreen ? '退出全屏 (Esc)' : '全屏阅读'}
          >
            {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>
        </div>
      </div>

      {/* Title bar */}
      <div className="doc-reader-titlebar">
        <h1>{doc.title}</h1>

        <div style={{ marginTop: '0.5rem' }}>
          <div className="tag-list">
            {tags.map(tag => (
              <span
                key={tag.id}
                className="tag-pill"
                style={{ background: `${tag.color}20`, color: tag.color }}
              >
                {tag.name}
              </span>
            ))}
            {!showTagInput ? (
              <button
                className="btn btn-ghost btn-sm"
                style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                onClick={() => setShowTagInput(true)}
              >
                <Plus size={12} /> 标签
              </button>
            ) : (
              <div className="tag-input-wrap">
                <input
                  type="text"
                  value={tagName}
                  onChange={e => setTagName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddTag()}
                  placeholder="标签名..."
                  style={{ padding: '4px 8px', fontSize: '0.8rem', width: '120px' }}
                  autoFocus
                />
                <button className="btn btn-ghost btn-sm" onClick={handleAddTag}>
                  <Plus size={12} />
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => { setShowTagInput(false); setTagName('') }}
                >
                  <X size={12} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* iframe — fullscreen targets this element */}
      <iframe
        ref={iframeRef}
        src={url}
        className="doc-reader-iframe"
        style={{ background: '#fff', border: 'none' }}
        sandbox="allow-scripts allow-same-origin"
        title={doc.title}
      />
    </div>
  )
}
