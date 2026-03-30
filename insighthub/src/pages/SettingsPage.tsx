import { useState } from 'react'
import { Settings, Cpu, ClipboardCheck, Save, CheckCircle2, AlertTriangle, Zap, KeyRound } from 'lucide-react'
import { usePreferenceStore } from '@/stores/preferenceStore'
import type { Difficulty } from '@/types'

export function SettingsPage() {
  const {
    aiApiUrl, aiModel, aiApiKey, quizDifficulty, quizQuestionCount,
    setAiApiUrl, setAiModel, setAiApiKey, setQuizDifficulty, setQuizQuestionCount,
  } = usePreferenceStore()

  const [localUrl, setLocalUrl] = useState(aiApiUrl)
  const [localModel, setLocalModel] = useState(aiModel)
  const [localApiKey, setLocalApiKey] = useState(aiApiKey)
  const [localDifficulty, setLocalDifficulty] = useState<Difficulty>(quizDifficulty)
  const [localCount, setLocalCount] = useState(quizQuestionCount)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const handleSave = () => {
    setAiApiUrl(localUrl)
    setAiModel(localModel)
    setAiApiKey(localApiKey)
    setQuizDifficulty(localDifficulty)
    setQuizQuestionCount(localCount)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleTestConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (localApiKey) {
        headers['Authorization'] = `Bearer ${localApiKey}`
      }
      const testUrl = localUrl.replace(/\/+$/, '').endsWith('/chat/completions')
        ? localUrl
        : `${localUrl.replace(/\/+$/, '')}/chat/completions`

      const response = await fetch(testUrl, {
        method: 'POST',
        headers,
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
        setTestResult({ ok: false, msg: `服务返回错误: HTTP ${response.status}` })
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
        </div>
        <div className="settings-card-body">
          <div className="settings-field">
            <label>API 地址</label>
            <input
              type="text"
              className="settings-input"
              value={localUrl}
              onChange={e => setLocalUrl(e.target.value)}
              placeholder="http://127.0.0.1:7001/v1"
            />
          </div>
          <div className="settings-field">
            <label>模型名称</label>
            <input
              type="text"
              className="settings-input"
              value={localModel}
              onChange={e => setLocalModel(e.target.value)}
              placeholder="default"
            />
          </div>
          <div className="settings-field">
            <label><KeyRound size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />API Key</label>
            <input
              type="password"
              className="settings-input"
              value={localApiKey}
              onChange={e => setLocalApiKey(e.target.value)}
              placeholder="留空则不发送（本地模型通常不需要）"
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
              onChange={e => setLocalCount(Math.max(1, Math.min(20, Number(e.target.value))))}
              min={1}
              max={20}
            />
          </div>
        </div>
      </div>

      {/* Save button */}
      <div className="settings-save-bar">
        <button className="btn btn-primary" onClick={handleSave}>
          <Save size={14} /> 保存设置
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
