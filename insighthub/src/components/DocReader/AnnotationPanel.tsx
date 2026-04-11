import { useState } from 'react'
import type { Annotation } from '@/types'
import { MessageSquare, Highlighter, Trash2, Pencil, Reply, Check, X, AlertTriangle } from 'lucide-react'
import { WikiLinkRenderer } from '@/components/DocReader/WikiLinkRenderer'

interface AnnotationPanelProps {
  annotations: Annotation[]
  titleLookup: Map<string, string>
  onScrollTo: (id: string) => void
  onRemove: (id: string) => void
  onUpdateComment?: (annotationId: string, comment: string) => void
  onAddReply?: (annotationId: string, text: string) => void
  staleAnnotationIds?: Set<string>
  onRemoveStale?: (ids: string[]) => void
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function AnnotationPanel({ annotations, titleLookup, onScrollTo, onRemove, onUpdateComment, onAddReply, staleAnnotationIds, onRemoveStale }: AnnotationPanelProps) {
  const staleCount = staleAnnotationIds?.size ?? 0

  if (annotations.length === 0) {
    return (
      <div className="annotation-panel">
        <div className="annotation-panel-header">
          <h3>笔记</h3>
        </div>
        <div className="annotation-panel-empty">
          <Highlighter size={32} />
          <p>暂无高亮和批注</p>
          <p className="annotation-panel-empty-hint">选中文本后可添加高亮或批注</p>
        </div>
      </div>
    )
  }

  return (
    <div className="annotation-panel">
      <div className="annotation-panel-header">
        <h3>笔记</h3>
        <span className="annotation-panel-count">{annotations.length}</span>
      </div>
      {staleCount > 0 && (
        <div className="annotation-panel-stale-bar">
          <AlertTriangle size={14} />
          <span>{staleCount} 条批注位置失效</span>
          {onRemoveStale && (
            <button
              className="annotation-panel-stale-clear"
              onClick={() => onRemoveStale([...staleAnnotationIds!])}
            >
              清除失效批注
            </button>
          )}
        </div>
      )}
      <div className="annotation-panel-list">
        {annotations
          .slice()
          .sort((a, b) => b.createdAt - a.createdAt)
          .map(ann => (
            <AnnotationItem
              key={ann.id}
              annotation={ann}
              titleLookup={titleLookup}
              onScrollTo={onScrollTo}
              onRemove={onRemove}
              onUpdateComment={onUpdateComment}
              onAddReply={onAddReply}
              isStale={staleAnnotationIds?.has(ann.id) ?? false}
            />
          ))}
      </div>
    </div>
  )
}

function AnnotationItem({
  annotation: ann,
  titleLookup,
  onScrollTo,
  onRemove,
  onUpdateComment,
  onAddReply,
  isStale,
}: {
  annotation: Annotation
  titleLookup: Map<string, string>
  onScrollTo: (id: string) => void
  onRemove: (id: string) => void
  onUpdateComment?: (annotationId: string, comment: string) => void
  onAddReply?: (annotationId: string, text: string) => void
  isStale?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(ann.comment || '')
  const [showReplyInput, setShowReplyInput] = useState(false)
  const [replyText, setReplyText] = useState('')

  const handleSaveEdit = () => {
    if (editText.trim() && onUpdateComment) {
      onUpdateComment(ann.id, editText.trim())
    }
    setEditing(false)
  }

  const handleCancelEdit = () => {
    setEditText(ann.comment || '')
    setEditing(false)
  }

  const handleAddReply = () => {
    if (replyText.trim() && onAddReply) {
      onAddReply(ann.id, replyText.trim())
      setReplyText('')
      setShowReplyInput(false)
    }
  }

  return (
    <div
      className={`annotation-panel-item${isStale ? ' annotation-panel-item-stale' : ''}`}
      onClick={() => !editing && !showReplyInput && !isStale && onScrollTo(ann.id)}
    >
      <div className="annotation-panel-item-header">
        <div
          className="annotation-panel-item-dot"
          style={{ backgroundColor: ann.color }}
        />
        <span className="annotation-panel-item-type">
          {ann.type === 'comment' ? (
            <><MessageSquare size={12} /> 批注</>
          ) : (
            <><Highlighter size={12} /> 高亮</>
          )}
        </span>
        <span className="annotation-panel-item-time">
          {formatTime(ann.createdAt)}
        </span>
        {isStale && (
          <span className="annotation-panel-item-stale-badge">位置失效</span>
        )}
      </div>
      <p className="annotation-panel-item-text">
        {ann.text.length > 100 ? ann.text.slice(0, 100) + '...' : ann.text}
      </p>

      {ann.comment && !editing && (
        <p className="annotation-panel-item-comment">
          <WikiLinkRenderer text={ann.comment} titleLookup={titleLookup} />
        </p>
      )}

      {editing && (
        <div className="annotation-panel-item-edit" onClick={e => e.stopPropagation()}>
          <textarea
            value={editText}
            onChange={e => setEditText(e.target.value)}
            rows={3}
            autoFocus
          />
          <div className="annotation-panel-item-edit-actions">
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleSaveEdit}
              title="保存"
            >
              <Check size={12} />
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleCancelEdit}
              title="取消"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Replies */}
      {ann.replies && ann.replies.length > 0 && (
        <div className="annotation-panel-item-replies">
          {ann.replies.slice().sort((a, b) => a.createdAt - b.createdAt).map(reply => (
            <div key={reply.id} className="annotation-panel-item-reply">
              <span className="annotation-panel-item-reply-time">{formatTime(reply.createdAt)}</span>
              <span className="annotation-panel-item-reply-text">{reply.text}</span>
            </div>
          ))}
        </div>
      )}

      {showReplyInput && (
        <div className="annotation-panel-item-reply-input" onClick={e => e.stopPropagation()}>
          <textarea
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            placeholder="添加回复..."
            rows={2}
            autoFocus
          />
          <div className="annotation-panel-item-edit-actions">
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleAddReply}
              disabled={!replyText.trim()}
            >
              <Check size={12} /> 发送
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => { setReplyText(''); setShowReplyInput(false) }}
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      <div className="annotation-panel-item-actions" onClick={e => e.stopPropagation()}>
        {ann.type === 'comment' && onUpdateComment && !editing && (
          <button
            className="annotation-panel-item-action"
            onClick={() => setEditing(true)}
            title="编辑"
          >
            <Pencil size={12} />
          </button>
        )}
        {onAddReply && !showReplyInput && !editing && (
          <button
            className="annotation-panel-item-action"
            onClick={() => setShowReplyInput(true)}
            title="回复"
          >
            <Reply size={12} />
          </button>
        )}
        <button
          className="annotation-panel-item-delete"
          onClick={() => onRemove(ann.id)}
          title="删除"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )
}
