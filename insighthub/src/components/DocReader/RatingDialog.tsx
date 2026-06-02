import { useState, useEffect } from 'react'
import { Star, X } from 'lucide-react'

interface RatingDialogProps {
  docTitle: string
  onRate: (rating: number) => void
  onSkip: () => void
}

export function RatingDialog({ docTitle, onRate, onSkip }: RatingDialogProps) {
  const [hover, setHover] = useState(0)
  const [selected, setSelected] = useState(0)

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

  return (
    <div className="rating-dialog-overlay" onClick={onSkip}>
      <div className="rating-dialog" onClick={e => e.stopPropagation()}>
        <div className="rating-dialog-header">
          <h3>Rate this document</h3>
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
          <button className="btn btn-secondary btn-sm" onClick={onSkip}>Skip</button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSubmit}
            disabled={selected === 0}
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  )
}
