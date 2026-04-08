import { useState } from 'react'
import { Lock, Eye, EyeOff, X, AlertCircle, Loader2 } from 'lucide-react'

interface DecryptDialogProps {
  onDecrypt: (password: string) => Promise<string>
  onCancel: () => void
}

export function DecryptDialog({ onDecrypt, onCancel }: DecryptDialogProps) {
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!password.trim()) return
    setLoading(true)
    setError(null)
    try {
      await onDecrypt(password)
    } catch (e) {
      setError(e instanceof Error ? e.message : '密码错误或解密失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'var(--bg-overlay)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="import-dialog" style={{ maxWidth: 400, width: '90%' }}>
        <div className="import-dialog-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Lock size={18} />
            文档已加密
          </h3>
        </div>

        <p style={{
          fontSize: '0.85rem', color: 'var(--text-secondary)',
          marginBottom: '1rem', lineHeight: 1.5,
        }}>
          该文档使用密码加密存储，请输入密码以查看内容。
        </p>

        <div style={{ position: 'relative', marginBottom: '0.5rem' }}>
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="请输入密码"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(null) }}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            autoFocus
            style={{ paddingRight: 36 }}
          />
          <button
            type="button"
            onClick={() => setShowPassword(v => !v)}
            style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', color: 'var(--text-dim)',
              cursor: 'pointer', display: 'flex', alignItems: 'center',
            }}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        {error && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            fontSize: '0.8rem', color: 'var(--accent-red)', marginBottom: '0.75rem',
          }}>
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        <div className="import-dialog-actions">
          <button className="btn btn-secondary" onClick={onCancel}>取消</button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={!password.trim() || loading}
          >
            {loading ? <Loader2 size={14} className="spin" /> : <Lock size={14} />}
            解密
          </button>
        </div>
      </div>
    </div>
  )
}
