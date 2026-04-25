import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle2, AlertTriangle, Zap, KeyRound,
  Loader2, ArrowLeft, Database, Plus, Trash2, FolderOpen, Folder, FileText,
  ChevronRight,
} from 'lucide-react'
import { usePreferenceStore } from '@/stores/preferenceStore'
import type { Difficulty, WorkspaceConfig } from '@/types'
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

const AVAILABLE_ICONS = [
  'Brain', 'Cpu', 'Code2', 'GraduationCap', 'BookOpen', 'Sparkles',
  'Server', 'Cloud', 'Database', 'Terminal', 'GitBranch', 'Network',
  'BarChart3', 'Briefcase', 'Globe', 'Layers', 'Lightbulb', 'ShieldCheck',
  'FileText', 'FolderOpen', 'Box', 'Package',
] as const

export function SettingsPage() {
  const {
    quizDifficulty, quizQuestionCount,
    setQuizDifficulty, setQuizQuestionCount,
    conceptMaxCount, setConceptMaxCount,
    workspaces, addWorkspace, updateWorkspace, removeWorkspace,
    activeWorkspace,
  } = usePreferenceStore()

  // AI profiles state
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

  // Workspace editing state
  const [editingWs, setEditingWs] = useState<WorkspaceConfig | null>(null)
  const [isNewWs, setIsNewWs] = useState(false)

  // Directory browser state
  const [browsePath, setBrowsePath] = useState<string>('')
  const [browseEntries, setBrowseEntries] = useState<{ name: string; isDirectory: boolean; path: string }[]>([])
  const [browseOpen, setBrowseOpen] = useState(false)
  const [browseLoading, setBrowseLoading] = useState(false)

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
    setEditName('New Config')
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
            name: editName || 'Untitled',
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
      if (editingId || isNewProfile) {
        const saveRes = await fetch('/api/ai/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'saveProfile',
            profile: {
              id: editingId || undefined,
              name: editName || 'Untitled',
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
      const params = new URLSearchParams({ url: editUrl })
      if (editApiKey && !editApiKey.includes('●')) {
        params.set('apiKey', editApiKey)
      }
      const modelsRes = await fetch(`/api/ai/models?${params}`, { signal: AbortSignal.timeout(65000) })
      if (!modelsRes.ok) {
        const errText = await modelsRes.text().catch(() => '')
        let errMsg = `HTTP ${modelsRes.status}`
        try { const e = JSON.parse(errText); errMsg = e.error || errMsg } catch {}
        setTestResult({ ok: false, msg: `Connection failed: ${errMsg}` })
        return
      }
      const modelsData = await modelsRes.json()
      const modelIds: string[] = (modelsData.data || modelsData.models || [])
        .map((m: any) => m.id || m.name || m)
        .filter((id: any) => typeof id === 'string')
        .sort((a: string, b: string) => a.localeCompare(b))
      setAvailableModels(modelIds)
      if (modelIds.length > 0) {
        setTestResult({ ok: true, msg: `Connected! Found ${modelIds.length} models.` })
      } else {
        setTestResult({ ok: true, msg: 'Connected! No model list returned, please enter manually.' })
      }
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.name === 'AbortError' ? 'Connection timed out' : `Connection failed: ${e.message}` })
    } finally {
      setTesting(false)
    }
  }

  const handleProfileClick = (p: AIProfile) => {
    populateForm(p, p.aiApiKey)
    setTestResult(null)
    setAvailableModels([])
  }

  // Workspace CRUD
  const handleSaveWorkspace = () => {
    if (!editingWs) return
    if (isNewWs) {
      addWorkspace(editingWs)
    } else {
      updateWorkspace(editingWs)
    }
    setEditingWs(null)
    setIsNewWs(false)
    syncWorkspacesToServer(isNewWs ? [...workspaces, editingWs] : workspaces.map(w => w.id === editingWs.id ? editingWs : w))
  }

  const handleDeleteWorkspace = (id: string) => {
    if (id === activeWorkspace) return
    removeWorkspace(id)
    syncWorkspacesToServer(workspaces.filter(w => w.id !== id))
  }

  const syncWorkspacesToServer = async (ws: WorkspaceConfig[]) => {
    try {
      await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ws),
      })
    } catch {}
  }

  const handleNewWorkspace = () => {
    const id = `workspace-${Date.now()}`
    const prefix = id.slice(0, 2).toLowerCase()
    setEditingWs({
      id,
      label: 'New Workspace',
      icon: 'FolderOpen',
      path: '',
      prefix,
    })
    setIsNewWs(true)
  }

  const openDirBrowser = async (currentPath: string) => {
    // Send raw path to backend; the server will path.resolve it
    setBrowseLoading(true)
    setBrowseOpen(true)
    try {
      const res = await fetch(`/api/browse-directories?path=${encodeURIComponent(currentPath)}`)
      const data = await res.json()
      setBrowsePath(data.currentPath)
      setBrowseEntries(data.entries || [])
    } catch {}
    setBrowseLoading(false)
  }

  const navigateDir = async (dirPath: string) => {
    setBrowseLoading(true)
    try {
      const res = await fetch(`/api/browse-directories?path=${encodeURIComponent(dirPath)}`)
      const data = await res.json()
      setBrowsePath(data.currentPath)
      setBrowseEntries(data.entries || [])
    } catch {}
    setBrowseLoading(false)
  }

  const selectDir = () => {
    if (editingWs) {
      setEditingWs({ ...editingWs, path: browsePath })
    }
    setBrowseOpen(false)
  }

  return (
    <div className="cs-settings">
      {/* Page header — CodeSentinel style */}
      <div className="cs-settings-header">
        <div className="cs-section-label">SETTINGS</div>
        <h1>Settings</h1>
        <p className="cs-settings-subtitle">Manage AI model configurations, quiz preferences, and workspaces.</p>
      </div>

      {/* Card 1: AI Model Configuration */}
      <div className="cs-card">
        <div className="cs-card-header">AI MODEL CONFIGURATION</div>
        <div className="cs-card-body">
          {/* Existing profiles list */}
          {profiles.length === 0 && !isNewProfile ? (
            <div className="cs-empty-hint">
              No AI configurations yet. Add one to enable AI-powered quizzes and concept extraction.
            </div>
          ) : (
            <div className="cs-item-list">
              {profiles.map(p => (
                <div
                  key={p.id}
                  className={`cs-model-item${p.id === activeProfileId ? ' active' : ''}${p.id === editingId ? ' editing' : ''}`}
                  onClick={() => handleProfileClick(p)}
                >
                  <div className="cs-model-info">
                    <div className="cs-model-name">
                      {p.name}
                      {p.id === activeProfileId && (
                        <span className="cs-badge cs-badge-active">ACTIVE</span>
                      )}
                      {p.id === editingId && p.id !== activeProfileId && (
                        <span className="cs-badge cs-badge-editing">EDITING</span>
                      )}
                    </div>
                    <div className="cs-model-meta">
                      <span>{p.aiApiUrl}</span>
                      <span>{p.aiModel || '—'}</span>
                    </div>
                  </div>
                  <div className="cs-model-actions">
                    {p.id !== activeProfileId && (
                      <>
                        <button
                          className="cs-btn cs-btn-primary"
                          onClick={e => { e.stopPropagation(); handleSwitchProfile(p.id) }}
                          disabled={saving}
                        >
                          Activate
                        </button>
                        <button
                          className="cs-btn cs-btn-ghost"
                          onClick={e => { e.stopPropagation(); handleDeleteProfile(p.id) }}
                          disabled={saving}
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add / Edit form — separated by border */}
          <div className="cs-form-separator">
            <div className="cs-section-label">
              {(editingId || isNewProfile) ? 'EDIT CONFIG' : 'ADD NEW CONFIG'}
            </div>
          </div>

          {(editingId || isNewProfile) ? (
            <>
              <div className="cs-form-row">
                <div className="cs-form-group">
                  <label>NAME</label>
                  <input
                    type="text"
                    value={loading ? 'Loading...' : editName}
                    onChange={e => setEditName(e.target.value)}
                    placeholder="e.g.: Local Qwen"
                    disabled={loading}
                  />
                </div>
                <div className="cs-form-group">
                  <label>API URL</label>
                  <input
                    type="text"
                    value={loading ? 'Loading...' : editUrl}
                    onChange={e => setEditUrl(e.target.value)}
                    placeholder="http://127.0.0.1:7001/v1"
                    disabled={loading}
                  />
                </div>
                <div className="cs-form-group">
                  <label>API KEY</label>
                  <input
                    type="password"
                    value={loading ? 'Loading...' : editApiKey}
                    onChange={e => setEditApiKey(e.target.value)}
                    placeholder="Leave empty to not send"
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="cs-form-row">
                <div className="cs-form-group">
                  <label>MODEL NAME</label>
                  {availableModels.length > 0 ? (
                    <select
                      value={editModel}
                      onChange={e => setEditModel(e.target.value)}
                    >
                      <option value="" disabled>Select Model</option>
                      {availableModels.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={loading ? 'Loading...' : editModel}
                      onChange={e => setEditModel(e.target.value)}
                      placeholder="Auto-fetched after Test Connection"
                      disabled={loading}
                    />
                  )}
                </div>
                <div className="cs-form-group cs-form-actions">
                  <div className="cs-btn-group">
                    <button className="cs-btn cs-btn-primary" onClick={handleTestConnection} disabled={testing}>
                      <Zap size={14} /> {testing ? 'Testing...' : 'Test Connection'}
                    </button>
                    <button className="cs-btn cs-btn-secondary" onClick={handleSave} disabled={saving}>
                      {saving ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} />} Save
                    </button>
                    <button className="cs-btn cs-btn-ghost" onClick={() => populateForm(undefined)}>
                      Cancel
                    </button>
                  </div>
                  {testResult && (
                    <div className={`cs-test-result ${testResult.ok ? 'success' : 'error'}`}>
                      {testResult.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                      {testResult.msg}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="cs-add-trigger" onClick={handleNewProfile}>
              <Plus size={14} /> Add New Config
            </div>
          )}
        </div>
      </div>

      {/* Card 2: Workspace Management */}
      <div className="cs-card">
        <div className="cs-card-header">WORKSPACE MANAGEMENT</div>
        <div className="cs-card-body">
          <div className="cs-card-desc">
            Configure document workspaces. Each workspace maps to an independent document directory. Changes require restarting the dev server to take effect.
          </div>

          <div className="cs-item-list">
            {workspaces.map(ws => (
              <div
                key={ws.id}
                className={`cs-model-item${ws.id === activeWorkspace ? ' active' : ''}${editingWs?.id === ws.id ? ' editing' : ''}`}
                onClick={() => {
                  setEditingWs({ ...ws })
                  setIsNewWs(false)
                }}
              >
                <div className="cs-model-info">
                  <div className="cs-model-name">
                    {ws.label}
                    {ws.id === activeWorkspace && (
                      <span className="cs-badge cs-badge-active">ACTIVE</span>
                    )}
                  </div>
                  <div className="cs-model-meta">
                    <span>prefix: {ws.prefix}-</span>
                    <span>{ws.path || '—'}</span>
                  </div>
                </div>
                <div className="cs-model-actions">
                  {ws.id !== activeWorkspace && (
                    <button
                      className="cs-btn cs-btn-ghost"
                      onClick={e => { e.stopPropagation(); handleDeleteWorkspace(ws.id) }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Workspace edit form */}
          {editingWs && (
            <>
              <div className="cs-form-separator">
                <div className="cs-section-label">
                  {isNewWs ? 'ADD WORKSPACE' : 'EDIT WORKSPACE'}
                </div>
              </div>
              <div className="cs-form-row">
                <div className="cs-form-group">
                  <label>DISPLAY NAME</label>
                  <input
                    type="text"
                    value={editingWs.label}
                    onChange={e => setEditingWs({ ...editingWs, label: e.target.value })}
                    placeholder="e.g.: MindInsight"
                  />
                </div>
                <div className="cs-form-group">
                  <label>ICON</label>
                  <select
                    value={editingWs.icon}
                    onChange={e => setEditingWs({ ...editingWs, icon: e.target.value })}
                  >
                    {AVAILABLE_ICONS.map(icon => (
                      <option key={icon} value={icon}>{icon}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="cs-form-row">
                <div className="cs-form-group">
                  <label>FILE SYSTEM PATH</label>
                  <div className="cs-path-browse">
                    <input
                      type="text"
                      value={editingWs.path}
                      onChange={e => setEditingWs({ ...editingWs, path: e.target.value })}
                      placeholder="e.g.: ../MindInsight"
                    />
                    <button
                      className="cs-btn cs-btn-secondary"
                      type="button"
                      onClick={() => openDirBrowser(editingWs.path)}
                    >
                      <FolderOpen size={14} /> Browse
                    </button>
                  </div>
                </div>
                <div className="cs-form-group">
                  <label>DOCUMENT ID PREFIX</label>
                  <input
                    type="text"
                    value={editingWs.prefix}
                    onChange={e => setEditingWs({ ...editingWs, prefix: e.target.value })}
                    placeholder="e.g.: mi, ti, li"
                  />
                </div>
              </div>
              <div className="cs-btn-group" style={{ marginTop: '0.5rem' }}>
                <button className="cs-btn cs-btn-primary" onClick={handleSaveWorkspace}>
                  <CheckCircle2 size={14} /> Save
                </button>
                <button className="cs-btn cs-btn-ghost" onClick={() => { setEditingWs(null); setIsNewWs(false) }}>
                  Cancel
                </button>
              </div>
            </>
          )}

          {!editingWs && (
            <div className="cs-add-trigger" onClick={handleNewWorkspace} style={{ marginTop: '0.75rem' }}>
              <Plus size={14} /> Add Workspace
            </div>
          )}
        </div>
      </div>

      {/* Card 3: Quiz & Concept Settings */}
      <div className="cs-card">
        <div className="cs-card-header">QUIZ & CONCEPT SETTINGS</div>
        <div className="cs-card-body">
          <div className="cs-form-row">
            <div className="cs-form-group">
              <label>QUIZ DIFFICULTY</label>
              <select
                value={localDifficulty}
                onChange={e => setLocalDifficulty(e.target.value as Difficulty)}
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
            <div className="cs-form-group">
              <label>QUIZ QUESTION COUNT</label>
              <input
                type="text"
                inputMode="numeric"
                value={localCount}
                onChange={e => setLocalCount(e.target.value.replace(/[^0-9]/g, ''))}
                onBlur={() => setLocalCount(String(Math.max(1, Math.min(20, Number(localCount) || 5))))}
              />
            </div>
            <div className="cs-form-group">
              <label>CONCEPT COUNT</label>
              <input
                type="text"
                inputMode="numeric"
                value={localConceptCount}
                onChange={e => setLocalConceptCount(e.target.value.replace(/[^0-9]/g, ''))}
                onBlur={() => setLocalConceptCount(String(Math.max(1, Math.min(50, Number(localConceptCount) || 10))))}
              />
            </div>
          </div>
          <div className="cs-btn-group">
            <button className="cs-btn cs-btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} />}
              {saved ? 'Saved' : 'Save Settings'}
            </button>
            {saved && (
              <div className="cs-test-result success">
                <CheckCircle2 size={14} /> Settings saved
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Card 4: Data Management */}
      <div className="cs-card">
        <div className="cs-card-header">DATA MANAGEMENT</div>
        <div className="cs-card-body">
          <div className="cs-card-desc">
            Export all learning data (reading history, annotations, tags, quizzes, flashcards, concept cards, achievements, etc.) as a JSON file for backup or migration to other devices.
          </div>
          <div className="cs-btn-group">
            <button
              className="cs-btn cs-btn-primary"
              onClick={async () => {
                setExporting(true)
                setDataMsg(null)
                try {
                  await exportAllData()
                  setDataMsg({ ok: true, msg: 'Export successful!' })
                } catch (e: any) {
                  setDataMsg({ ok: false, msg: `Export failed: ${e.message}` })
                } finally {
                  setExporting(false)
                }
              }}
              disabled={exporting || importing}
            >
              {exporting ? <Loader2 size={14} className="spin" /> : <Database size={14} />}
              {exporting ? 'Exporting...' : 'Export All Data'}
            </button>
            <button
              className="cs-btn cs-btn-secondary"
              onClick={() => document.getElementById('cs-import-file')?.click()}
              disabled={exporting || importing}
            >
              {importing ? <Loader2 size={14} className="spin" /> : <Database size={14} />}
              {importing ? 'Importing...' : 'Import Data'}
            </button>
            <input
              id="cs-import-file"
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
                    setDataMsg({ ok: false, msg: 'Unsupported backup file format' })
                    return
                  }
                  if (!window.confirm('Import will overwrite all current data. Continue?')) return
                  setImporting(true)
                  const result = await importAllData(data)
                  setDataMsg({ ok: true, msg: `Import successful! Restored ${result.localKeys} local items and ${result.serverEndpoints} server items.` })
                  setTimeout(() => window.location.reload(), 1500)
                } catch (err: any) {
                  setDataMsg({ ok: false, msg: `Import failed: ${err.message}` })
                } finally {
                  setImporting(false)
                  e.target.value = ''
                }
              }}
            />
          </div>
          {dataMsg && (
            <div className={`cs-test-result ${dataMsg.ok ? 'success' : 'error'}`}>
              {dataMsg.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              {dataMsg.msg}
            </div>
          )}
        </div>
      </div>

      {/* Directory browser dialog */}
      {browseOpen && (
        <div className="cs-dir-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setBrowseOpen(false) }}>
          <div className="cs-dir-dialog">
            <div className="cs-dir-header">
              <div className="cs-dir-current">
                <FolderOpen size={16} />
                <span>{browsePath}</span>
              </div>
              <div className="cs-dir-close" onClick={() => setBrowseOpen(false)}>
                <Trash2 size={16} />
              </div>
            </div>
            <div className="cs-dir-body">
              {browseLoading ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)' }}>
                  <Loader2 size={20} className="spin" />
                </div>
              ) : browseEntries.length === 0 ? (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                  Empty Directory
                </div>
              ) : (
                browseEntries.map(entry => (
                  <div
                    key={entry.path}
                    className="cs-dir-entry"
                    onClick={() => entry.isDirectory ? navigateDir(entry.path) : undefined}
                    onDoubleClick={() => entry.isDirectory ? navigateDir(entry.path) : undefined}
                  >
                    <div className="cs-dir-icon">
                      {entry.isDirectory
                        ? <Folder size={16} />
                        : <FileText size={16} />
                      }
                    </div>
                    <span className="cs-dir-name">{entry.name}</span>
                  </div>
                ))
              )}
            </div>
            <div className="cs-dir-footer">
              <button className="cs-btn cs-btn-ghost" onClick={() => { const i = browsePath.lastIndexOf('/'); if (i > 0) navigateDir(browsePath.slice(0, i)) }}>
                <ChevronRight size={14} style={{ transform: 'rotate(180deg)' }} />
                ..
              </button>
              <button className="cs-btn cs-btn-primary" onClick={selectDir}>
                Select This Folder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
