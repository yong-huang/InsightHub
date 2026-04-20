import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Settings, Cpu, ClipboardCheck, Save, CheckCircle2, AlertTriangle, Zap, Server, KeyRound, Loader2, ArrowLeft, Database, Plus, Trash2 } from 'lucide-react'
import { usePreferenceStore } from '@/stores/preferenceStore'
import type { Difficulty } from '@/types'
import { exportAllData, importAllData } from '@/utils/dataExporter'
import type { ExportData } from '@/utils/dataExporter'

interface AIProfile {
  id: string
  name: string
  aiApiUrl: string
  aiModel: string
  aiApiKey: string
}

interface AIConfig {
  profiles: AIProfile[]
  activeProfileId: string
  quizDifficulty: string
  quizQuestionCount: number
}

export function SettingsPage() {
  const {
    quizDifficulty, quizQuestionCount,
    setQuizDifficulty, setQuizQuestionCount,
    conceptMaxCount, setConceptMaxCount,
  } = usePreferenceStore()

  const [profiles, setProfiles] = useState<AIProfile[]>([])
  const [activeProfileId, setActiveProfileId] = useState('')
  const [editingId, setEditingId] = useState('')
  const [editName, setEditName] = useState('')
  const [editUrl, setEditUrl] = useState('')
  const [editModel, setEditModel] = useState('')
  const [editApiKey, setEditApiKey] = useState('')
  const [isNewProfile, setIsNewProfile] = useState(false)

  const [localDifficulty, setLocalDifficulty] = useState<Difficulty>(quizDifficulty)
  const [localCount, setLocalCount] = useState(String(quizQuestionCount))
  const [localConceptCount, setLocalConceptCount] = useState(String(conceptMaxCount))
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const navigate = useNavigate()

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [availableModels, setAvailableModels] = useState<string[]>([])

  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [dataMsg, setDataMsg] = useState<{ ok: boolean; msg: string } | null>(null)

  const populateForm = (p: AIProfile | undefined, apiKey?: string) => {
    if (!p) {
      setEditingId('')
      setEditName('')
      setEditUrl('')
      setEditModel('')
      setEditApiKey('')
      setIsNewProfile(false)
      return
    }
    setEditingId(p.id)
    setEditName(p.name)
    setEditUrl(p.aiApiUrl)
    setEditModel(p.aiModel)
    setEditApiKey(apiKey ?? p.aiApiKey)
    setIsNewProfile(false)
  }

  useEffect(() => {
    fetch('/api/ai/config')
      .then(r => r.json())
      .then((cfg: AIConfig) => {
        setProfiles(cfg.profiles || [])
        setActiveProfileId(cfg.activeProfileId || '')
        const active = (cfg.profiles || []).find((p: AIProfile) => p.id === cfg.activeProfileId)
        populateForm(active, active?.aiApiKey)
        if (cfg.quizDifficulty) setLocalDifficulty(cfg.quizDifficulty as Difficulty)
        if (cfg.quizQuestionCount) setLocalCount(cfg.quizQuestionCount)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const refreshFromResponse = async (res: Response) => {
    if (!res.ok) return
    const cfg: AIConfig = await res.json()
    setProfiles(cfg.profiles || [])
    setActiveProfileId(cfg.activeProfileId || '')
  }

  const handleSwitchProfile = async (profileId: string) => {
    setSaving(true)
    try {
      const res = await fetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'switchProfile', profileId }),
      })
      await refreshFromResponse(res)
      const target = profiles.find(p => p.id === profileId)
      populateForm(target, target?.aiApiKey)
    } catch {}
    setSaving(false)
  }

  const handleNewProfile = () => {
    setIsNewProfile(true)
    setEditingId('')
    setEditName('新配置')
    setEditUrl('http://127.0.0.1:7001/v1')
    setEditModel('')
    setEditApiKey('')
    setAvailableModels([])
    setTestResult(null)
  }

  const handleDeleteProfile = async (profileId: string) => {
    if (profileId === activeProfileId) return
    setSaving(true)
    try {
      const res = await fetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteProfile', profileId }),
      })
      if (!res.ok) return
      const cfg: AIConfig = await res.json()
      setProfiles(cfg.profiles || [])
      setActiveProfileId(cfg.activeProfileId || '')
      // If we were editing this profile, switch to active
      if (editingId === profileId) {
        const active = (cfg.profiles || []).find((p: AIProfile) => p.id === cfg.activeProfileId)
        populateForm(active, active?.aiApiKey)
      }
    } catch {}
    setSaving(false)
  }

  const handleSave = async () => {
    setSaving(true)
    setTestResult(null)
    try {
      const profileRes = await fetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'saveProfile',
          profile: {
            id: editingId || undefined,
            name: editName || '未命名',
            aiApiUrl: editUrl,
            aiModel: editModel,
            aiApiKey: editApiKey,
          },
        }),
      })
      if (profileRes.ok) {
        const cfg: AIConfig = await profileRes.json()
        setProfiles(cfg.profiles || [])
        setActiveProfileId(cfg.activeProfileId || '')
        if (!editingId && cfg.profiles?.length) {
          const latest = cfg.profiles[cfg.profiles.length - 1]
          setEditingId(latest.id)
        }
        setIsNewProfile(false)
      }
      const quizRes = await fetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quizDifficulty: localDifficulty,
          quizQuestionCount: Number(localCount) || 5,
        }),
      })
      if (quizRes.ok) {
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
    setAvailableModels([])
    try {
      // Save profile (without switching active) so the new profile exists
      if (editingId || isNewProfile) {
        const saveRes = await fetch('/api/ai/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'saveProfile',
            profile: {
              id: editingId || undefined,
              name: editName || '未命名',
              aiApiUrl: editUrl,
              aiModel: editModel,
              aiApiKey: editApiKey,
            },
          }),
        })
        if (saveRes.ok) {
          const cfg: AIConfig = await saveRes.json()
          setProfiles(cfg.profiles || [])
          if (!editingId && cfg.profiles?.length) {
            setEditingId(cfg.profiles[cfg.profiles.length - 1].id)
          }
          setIsNewProfile(false)
        }
      }
      // Test connection by fetching models directly (no profile switch needed)
      const params = new URLSearchParams({ url: editUrl })
      if (editApiKey && !editApiKey.includes('●')) {
        params.set('apiKey', editApiKey)
      }
      const modelsRes = await fetch(`/api/ai/models?${params}`, { signal: AbortSignal.timeout(65000) })
      if (!modelsRes.ok) {
        const errText = await modelsRes.text().catch(() => '')
        let errMsg = `HTTP ${modelsRes.status}`
        try { const e = JSON.parse(errText); errMsg = e.error || errMsg } catch {}
        setTestResult({ ok: false, msg: `连接失败: ${errMsg}` })
        return
      }
      const modelsData = await modelsRes.json()
      const modelIds: string[] = (modelsData.data || modelsData.models || [])
        .map((m: any) => m.id || m.name || m)
        .filter((id: any) => typeof id === 'string')
        .sort((a: string, b: string) => a.localeCompare(b))
      setAvailableModels(modelIds)
      if (modelIds.length > 0) {
        setTestResult({ ok: true, msg: `连接成功！获取到 ${modelIds.length} 个模型。` })
      } else {
        setTestResult({ ok: true, msg: '连接成功！但未获取到模型列表，请手动输入。' })
      }
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.name === 'AbortError' ? '连接超时' : `连接失败: ${e.message}` })
    } finally {
      setTesting(false)
    }
  }

  const handleProfileClick = (p: AIProfile) => {
    populateForm(p, p.aiApiKey)
    setTestResult(null)
    setAvailableModels([])
  }

  return (
    <div className="page-settings">
      <div className="page-header">
        <h1><Settings size={22} style={{ marginRight: 8, verticalAlign: 'middle' }} /> 设置</h1>
        <p>管理 AI 模型配置和测验偏好</p>
      </div>

      <div className="settings-grid">
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
            {/* Profile list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {profiles.map(p => (
                <div
                  key={p.id}
                  className={`settings-profile-item${p.id === activeProfileId ? ' active' : ''}${p.id === editingId ? ' editing' : ''}`}
                  onClick={() => handleProfileClick(p)}
                >
                  <div className="settings-profile-dot" />
                  <span className="settings-profile-name">{p.name}</span>
                  {p.id === activeProfileId && <span className="settings-profile-badge">当前</span>}
                  {p.id === editingId && p.id !== activeProfileId && (
                    <span className="settings-profile-badge" style={{ background: 'rgba(167,139,250,0.15)', color: 'var(--accent-purple)' }}>编辑中</span>
                  )}
                  <div className="settings-profile-actions">
                    {p.id !== activeProfileId && (
                      <button
                        className="settings-profile-delete"
                        onClick={e => { e.stopPropagation(); handleDeleteProfile(p.id) }}
                        title="删除此配置"
                        disabled={saving}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <div className="settings-profile-add" onClick={handleNewProfile}>
                <Plus size={14} /> 添加新配置
              </div>
            </div>

            {/* Edit section */}
            <div className="settings-edit-section">
              <div className="settings-edit-title">
                {isNewProfile ? '新建配置' : editingId ? `编辑: ${editName}` : '选择一个配置进行编辑'}
              </div>
              {(editingId || isNewProfile) && (
                <>
                  <div className="settings-field">
                    <label>配置名称</label>
                    <input
                      type="text"
                      className="settings-input"
                      value={loading ? '加载中...' : editName}
                      onChange={e => setEditName(e.target.value)}
                      placeholder="如：本地 Qwen、Claude API"
                      disabled={loading}
                    />
                  </div>
                  <div className="settings-field">
                    <label>API 地址</label>
                    <input
                      type="text"
                      className="settings-input"
                      value={loading ? '加载中...' : editUrl}
                      onChange={e => setEditUrl(e.target.value)}
                      placeholder="http://127.0.0.1:7001/v1"
                      disabled={loading}
                    />
                  </div>
                  <div className="settings-field">
                    <label><KeyRound size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />API Key</label>
                    <input
                      type="password"
                      className="settings-input"
                      value={loading ? '加载中...' : editApiKey}
                      onChange={e => setEditApiKey(e.target.value)}
                      placeholder="留空则不发送（本地模型通常不需要）"
                      disabled={loading}
                    />
                  </div>

                  {/* Connection test & model selection */}
                  <div className="settings-edit-section" style={{ marginTop: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
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

                    {/* Model selection — only shown after successful connection */}
                    {availableModels.length > 0 ? (
                      <div className="settings-field">
                        <label>模型名称</label>
                        <select
                          className="filter-select"
                          style={{ flex: 1 }}
                          value={editModel}
                          onChange={e => setEditModel(e.target.value)}
                        >
                          <option value="" disabled>选择模型</option>
                          {availableModels.map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div className="settings-field">
                        <label>模型名称</label>
                        <input
                          type="text"
                          className="settings-input"
                          value={loading ? '加载中...' : editModel}
                          onChange={e => setEditModel(e.target.value)}
                          placeholder="点击「测试连接」后自动获取"
                          disabled={loading}
                        />
                      </div>
                    )}

                    {/* Switch button for non-active profile */}
                    {editingId && editingId !== activeProfileId && (
                      <button
                        className="btn btn-primary"
                        onClick={() => handleSwitchProfile(editingId)}
                        disabled={saving || loading}
                      >
                        切换到此配置
                      </button>
                    )}
                  </div>
                </>
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
                style={{ flex: 1 }}
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
      </div>

      {/* Data Management — full width */}
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
