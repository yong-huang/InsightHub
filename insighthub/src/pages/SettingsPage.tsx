import { useState, useEffect } from 'react'
import { Settings, Cpu, ClipboardCheck, Save, CheckCircle2, AlertTriangle, Zap, Server, KeyRound, Loader2 } from 'lucide-react'
import { usePreferenceStore } from '@/stores/preferenceStore'
import type { Difficulty } from '@/types'

interface AIConfig {
  aiApiUrl: string
  aiModel: string
  aiApiKey: string
  quizDifficulty: string
  quizQuestionCount: number
}

export function SettingsPage() {
  const {
    quizDifficulty, quizQuestionCount,
    setQuizDifficulty, setQuizQuestionCount,
  } = usePreferenceStore()

  const [localUrl, setLocalUrl] = useState('')
  const [localModel, setLocalModel] = useState('')
  const [localApiKey, setLocalApiKey] = useState('')
  const [localDifficulty, setLocalDifficulty] = useState<Difficulty>(quizDifficulty)
  const [localCount, setLocalCount] = useState(quizQuestionCount)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)

  // Load AI config from server
  useEffect(() => {
    fetch('/api/ai/config')
      .then(r => r.json())
      .then((cfg: AIConfig) => {
        setLocalUrl(cfg.aiApiUrl)
        setLocalModel(cfg.aiModel)
        setLocalApiKey(cfg.aiApiKey)
        if (cfg.quizDifficulty) setLocalDifficulty(cfg.quizDifficulty as Difficulty)
        if (cfg.quizQuestionCount) setLocalCount(cfg.quizQuestionCount)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aiApiUrl: localUrl,
          aiModel: localModel,
          aiApiKey: localApiKey,
          quizDifficulty: localDifficulty,
          quizQuestionCount: localCount,
        }),
      })
      if (res.ok) {
        setQuizDifficulty(localDifficulty)
        setQuizQuestionCount(localCount)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    } catch {}
    setSaving(false)
  }

  const handleTestConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      // Save current form values to server first, so test uses latest config
      await fetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aiApiUrl: localUrl,
          aiModel: localModel,
          aiApiKey: localApiKey,
          quizDifficulty: localDifficulty,
          quizQuestionCount: localCount,
        }),
      })
      const response = await fetch('/api/ai/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: localModel,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 5,
        }),
        signal: AbortSignal.timeout(10000),
      })
      if (response.ok) {
        setTestResult({ ok: true, msg: '连接成功！AI 服务可用。' })
      } else {
        const err = await response.text().catch(() => '')
        setTestResult({ ok: false, msg: `服务返回错误: HTTP ${response.status} ${err.slice(0, 80)}` })
      }
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.name === 'AbortError' ? '连接超时' : `连接失败: ${e.message}` })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="page-settings">
      <div className="page-header">
        <h1><Settings size={24} style={{ marginRight: 8, verticalAlign: 'middle' }} /> 设置</h1>
        <p>管理 AI 模型配置和测验偏好</p>
      </div>

      {/* AI Model Config */}
      <div className="settings-card">
        <div className="settings-card-header">
          <Cpu size={20} />
          <h2>AI 模型配置</h2>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Server size={12} /> 服务端管理
          </span>
        </div>
        <div className="settings-card-body">
          <div className="settings-field">
            <label>API 地址</label>
            <input
              type="text"
              className="settings-input"
              value={loading ? '加载中...' : localUrl}
              onChange={e => setLocalUrl(e.target.value)}
              placeholder="http://127.0.0.1:7001/v1"
              disabled={loading}
            />
          </div>
          <div className="settings-field">
            <label>模型名称</label>
            <input
              type="text"
              className="settings-input"
              value={loading ? '加载中...' : localModel}
              onChange={e => setLocalModel(e.target.value)}
              placeholder="Qwen/Qwen3.5-27B-4bit"
              disabled={loading}
            />
          </div>
          <div className="settings-field">
            <label><KeyRound size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />API Key</label>
            <input
              type="password"
              className="settings-input"
              value={loading ? '加载中...' : localApiKey}
              onChange={e => setLocalApiKey(e.target.value)}
              placeholder="留空则不发送（本地模型通常不需要）"
              disabled={loading}
            />
          </div>
          <div className="settings-actions">
            <button
              className="btn btn-secondary"
              onClick={handleTestConnection}
              disabled={testing}
            >
              <Zap size={14} /> {testing ? '测试中...' : '测试连接'}
            </button>
            {testResult && (
              <span className={`settings-test-result ${testResult.ok ? 'success' : 'error'}`}>
                {testResult.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                {testResult.msg}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Quiz Settings */}
      <div className="settings-card">
        <div className="settings-card-header">
          <ClipboardCheck size={20} />
          <h2>测验设置</h2>
        </div>
        <div className="settings-card-body">
          <div className="settings-field">
            <label>默认难度</label>
            <select
              className="filter-select"
              value={localDifficulty}
              onChange={e => setLocalDifficulty(e.target.value as Difficulty)}
            >
              <option value="easy">简单</option>
              <option value="medium">中等</option>
              <option value="hard">困难</option>
            </select>
          </div>
          <div className="settings-field">
            <label>题目数量</label>
            <input
              type="number"
              className="settings-input"
              value={localCount}
              onChange={e => {
                const val = e.target.value
                setLocalCount(val === '' ? 0 : Number(val))
              }}
              onBlur={() => setLocalCount(Math.max(1, Math.min(20, localCount || 1)))}
              min={1}
              max={20}
            />
          </div>
        </div>
      </div>

      {/* Save button */}
      <div className="settings-save-bar">
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />} 保存设置
        </button>
        {saved && (
          <span className="settings-saved-msg">
            <CheckCircle2 size={14} /> 已保存
          </span>
        )}
      </div>
    </div>
  )
}
