import { Component, type ReactNode, type ErrorInfo } from 'react'
import { AlertTriangle } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="empty-state">
          <AlertTriangle size={48} />
          <h3>出错了</h3>
          <p>{this.state.error?.message || '页面加载失败'}</p>
          <button
            className="btn btn-secondary btn-sm"
            style={{ marginTop: '1rem' }}
            onClick={() => this.setState({ hasError: false })}
          >
            重试
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
