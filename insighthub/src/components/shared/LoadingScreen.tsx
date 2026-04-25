import { useDocumentStore } from '@/stores/documentStore'

export function LoadingScreen() {
  const progress = useDocumentStore(s => s.loadProgress)

  return (
    <div className="loading-screen fade-in">
      <div className="loading-content">
        <div className="loading-icon spin">
          <svg width="48" height="48" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="40" fill="none" stroke="var(--accent-blue)" strokeWidth="4" opacity="0.2" />
            <circle cx="50" cy="50" r="40" fill="none" stroke="var(--accent-blue)" strokeWidth="4" strokeDasharray="80 200" strokeLinecap="round" />
          </svg>
        </div>
        <h2 className="gradient-text">InsightHub</h2>
        <p className="loading-text">Loading documents...</p>
        {progress.total > 0 && (
          <div className="loading-progress">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
            <span className="progress-text">{progress.current} / {progress.total}</span>
          </div>
        )}
      </div>
    </div>
  )
}
