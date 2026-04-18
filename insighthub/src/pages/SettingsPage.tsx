import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Settings, Cpu, ClipboardCheck, Save, CheckCircle2, AlertTriangle, Zap, Server, KeyRound, Loader2, ArrowLeft, Database } from 'lucide-react'
import { usePreferenceStore } from '@/stores/preferenceStore'
import type { Difficulty } from '@/types'
import { exportAllData, importAllData } from '@/utils/dataExporter'
import type { ExportData } from '@/utils/dataExporter'

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
    conceptMaxCount, setConceptMaxCount,
  } = usePreferenceStore()

  const [localUrl, setLocalUrl] = useState('')
  const [localModel, setLocalModel] = useState('')
  const [localApiKey, setLocalApiKey] = useState('')
  const [localDifficulty, setLocalDifficulty] = useState<Difficulty>(quizDifficulty)
  const [localCount, setLocalCount] = useState(String(quizQuestionCount))
  const [localConceptCount, setLocalConceptCount] = useState(String(conceptMaxCount))
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const navigate = useNavigate()

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [dataMsg, setDataMsg] = useState<{ ok: boolean; msg: string } | null>(null)

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
          quizQuestionCount: Number(localCount) || 5,
        }),
      })
      if (res.ok) {
        setQuizDifficulty(localDifficulty)
        setQuizQuestionCount(localCount)
        setConceptMaxCount(Number(localConceptCount) || 10)
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
          quizQuestionCount: Number(localCount) || 5,
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
        <h1><Settings size={22} style={{ marginRight: 8, verticalAlign: 'middle' }} /> 设置</h1>
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
              type="text"
              inputMode="numeric"
              className="settings-input"
              value={localCount}
              onChange={e => {
                const val = e.target.value.replace(/[^0-9]/g, '')
                setLocalCount(val)
              }}
              onBlur={() => {
                const n = Math.max(1, Math.min(20, Number(localCount) || 5))
                setLocalCount(String(n))
              }}
            />
          </div>
          <div className="settings-field">
            <label>概念数量</label>
            <input
              type="text"
              inputMode="numeric"
              className="settings-input"
              value={localConceptCount}
              onChange={e => {
                const val = e.target.value.replace(/[^0-9]/g, '')
                setLocalConceptCount(val)
              }}
              onBlur={() => {
                const n = Math.max(1, Math.min(50, Number(localConceptCount) || 10))
                setLocalConceptCount(String(n))
              }}
            />
          </div>
        </div>
      </div>

      {/* Data Management */}
      <div className="settings-card">
        <div className="settings-card-header">
          <Database size={20} />
          <h2>数据管理</h2>
        </div>
        <div className="settings-card-body">
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 12px 0', lineHeight: 1.5 }}>
            导出所有学习数据（阅读记录、批注、标签、测验、闪卡、概念卡片、成就等）为 JSON 文件，可用于备份或迁移到其他设备。
          </p>
          <div className="settings-actions">
            <button
              className="btn btn-primary"
              onClick={async () => {
                setExporting(true)
                setDataMsg(null)
                try {
                  await exportAllData()
                  setDataMsg({ ok: true, msg: '导出成功！' })
                } catch (e: any) {
                  setDataMsg({ ok: false, msg: `导出失败: ${e.message}` })
                } finally {
                  setExporting(false)
                }
              }}
              disabled={exporting || importing}
            >
              {exporting ? <Loader2 size={14} className="spin" /> : <Database size={14} />}
              {exporting ? '导出中...' : '导出全部数据'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => document.getElementById('import-file-input')?.click()}
              disabled={exporting || importing}
            >
              {importing ? <Loader2 size={14} className="spin" /> : <Database size={14} />}
              {importing ? '导入中...' : '导入数据'}
            </button>
            <input
              id="import-file-input"
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                setDataMsg(null)
                try {
                  const text = await file.text()
                  const data = JSON.parse(text) as ExportData
                  if (data.version !== 1) {
                    setDataMsg({ ok: false, msg: '不支持的备份文件格式' })
                    return
                  }
                  if (!window.confirm('导入将覆盖当前所有数据，确认继续？')) return
                  setImporting(true)
                  const result = await importAllData(data)
                  setDataMsg({ ok: true, msg: `导入成功！恢复了 ${result.localKeys} 项本地数据和 ${result.serverEndpoints} 项服务端数据。` })
                  setTimeout(() => window.location.reload(), 1500)
                } catch (err: any) {
                  setDataMsg({ ok: false, msg: `导入失败: ${err.message}` })
                } finally {
                  setImporting(false)
                  e.target.value = ''
                }
              }}
            />
            {dataMsg && (
              <span className={`settings-test-result ${dataMsg.ok ? 'success' : 'error'}`}>
                {dataMsg.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                {dataMsg.msg}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Save button */}
      <div className="settings-save-bar">
        <button className="btn btn-secondary" onClick={() => navigate(-1)}>
          <ArrowLeft size={18} /> 返回
        </button>
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
