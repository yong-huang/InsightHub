import type { Annotation } from '@/types'
import { MessageSquare, Highlighter, Trash2 } from 'lucide-react'

interface AnnotationPanelProps {
  annotations: Annotation[]
  onScrollTo: (id: string) => void
  onRemove: (id: string) => void
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function AnnotationPanel({ annotations, onScrollTo, onRemove }: AnnotationPanelProps) {
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
      <div className="annotation-panel-list">
        {annotations
          .slice()
          .sort((a, b) => b.createdAt - a.createdAt)
          .map(ann => (
            <div
              key={ann.id}
              className="annotation-panel-item"
              onClick={() => onScrollTo(ann.id)}
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
              </div>
              <p className="annotation-panel-item-text">
                {ann.text.length > 100 ? ann.text.slice(0, 100) + '...' : ann.text}
              </p>
              {ann.comment && (
                <p className="annotation-panel-item-comment">{ann.comment}</p>
              )}
              <button
                className="annotation-panel-item-delete"
                onClick={e => { e.stopPropagation(); onRemove(ann.id) }}
                title="删除"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
      </div>
    </div>
  )
}
