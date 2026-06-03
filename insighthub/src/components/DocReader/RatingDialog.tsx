import { useState, useEffect } from 'react'
import { Star, X, RotateCcw } from 'lucide-react'

interface RatingDialogProps {
  docTitle: string
  currentRating?: number
  onRate: (rating: number) => void
  onSkip: () => void
  onMarkUnread?: () => void
}

export function RatingDialog({ docTitle, currentRating, onRate, onSkip, onMarkUnread }: RatingDialogProps) {
  const [hover, setHover] = useState(0)
  const [selected, setSelected] = useState(currentRating || 0)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSkip()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onSkip])

  const handleSubmit = () => {
    if (selected > 0) onRate(selected)
  }

  const isEditing = !!currentRating

  return (
    <div className="rating-dialog-overlay" onClick={onSkip}>
      <div className="rating-dialog" onClick={e => e.stopPropagation()}>
        <div className="rating-dialog-header">
          <h3>{isEditing ? 'Update rating' : 'Rate this document'}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onSkip}>
            <X size={16} />
          </button>
        </div>
        <p className="rating-dialog-title">{docTitle}</p>
        <div className="rating-dialog-stars">
          {[1, 2, 3, 4, 5].map(star => (
            <button
              key={star}
              className={`rating-star ${star <= (hover || selected) ? 'active' : ''}`}
              onMouseEnter={() => setHover(star)}
              onMouseLeave={() => setHover(0)}
              onClick={() => setSelected(star)}
            >
              <Star size={22} fill={star <= (hover || selected) ? 'currentColor' : 'none'} />
            </button>
          ))}
        </div>
        <div className="rating-dialog-actions">
          {isEditing && onMarkUnread && (
            <button className="btn btn-ghost btn-sm rating-dialog-unread-btn" onClick={onMarkUnread} title="Mark as unread">
              <RotateCcw size={14} /> Unread
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button className="btn btn-secondary btn-sm" onClick={onSkip}>{isEditing ? 'Cancel' : 'Skip'}</button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSubmit}
            disabled={selected === 0}
          >
            {isEditing ? 'Update' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  )
}
