import { useState } from 'react'
import { HIGHLIGHT_COLORS } from '@/types'
import { X } from 'lucide-react'

interface CommentDialogProps {
  selectedText: string
  onSave: (comment: string, color: string) => void
  onCancel: () => void
}

export function CommentDialog({ selectedText, onSave, onCancel }: CommentDialogProps) {
  const [comment, setComment] = useState('')
  const [color, setColor] = useState<string>(HIGHLIGHT_COLORS[0])

  const handleSave = () => {
    if (!comment.trim()) return
    onSave(comment.trim(), color)
  }

  return (
    <div className="comment-dialog-overlay" onMouseDown={e => e.stopPropagation()}>
      <div className="comment-dialog">
        <div className="comment-dialog-header">
          <h3>Add Comment</h3>
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>
            <X size={16} />
          </button>
        </div>
        <div className="comment-dialog-selected">
          <span className="comment-dialog-label">Selected Text</span>
          <p className="comment-dialog-text">{selectedText.length > 150 ? selectedText.slice(0, 150) + '...' : selectedText}</p>
        </div>
        <div className="comment-dialog-colors">
          <span className="comment-dialog-label">Color</span>
          <div className="comment-dialog-color-row">
            {HIGHLIGHT_COLORS.map(c => (
              <button
                key={c}
                className={`annotation-color-btn ${color === c ? 'active' : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>
        <textarea
          className="comment-dialog-input"
          placeholder="Write your comment..."
          value={comment}
          onChange={e => setComment(e.target.value)}
          autoFocus
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSave()
            if (e.key === 'Escape') onCancel()
          }}
        />
        <div className="comment-dialog-actions">
          <button className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={!comment.trim()}
          >
            Save Comment
          </button>
        </div>
      </div>
    </div>
  )
}
