import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle2, AlertTriangle, Zap, KeyRound,
  Loader2, ArrowLeft, Database, Plus, Trash2, FolderOpen, Folder, FileText,
  ChevronRight, ChevronDown, ArrowRightLeft,
} from 'lucide-react'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { useDocumentStore } from '@/stores/documentStore'
import type { FeatureKey } from '@/stores/preferenceStore'
import type { Difficulty, WorkspaceConfig, QuestionType } from '@/types'
import { exportAllData, importAllData } from '@/utils/dataExporter'
import type { ExportData } from '@/utils/dataExporter'
import { WORKSPACE_ICONS, AVAILABLE_ICON_NAMES } from '@/utils/workspaceIcons'
import { storageService } from '@/services/storageService'

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
  visionProfileId: string
  quizDifficulty: string
  quizQuestionCount: number
}

function IconPicker({ value, onChange }: { value: string; onChange: (icon: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const SelectedIcon = WORKSPACE_ICONS[value]

  return (
    <div ref={ref} className="icon-picker">
      <button type="button" className="icon-picker-trigger" onClick={() => setOpen(v => !v)}>
        {SelectedIcon ? <SelectedIcon size={16} /> : <span style={{ width: 16 }} />}
        <span>{value}</span>
        <ChevronDown size={14} className="icon-picker-chevron" />
      </button>
      {open && (
        <div className="icon-picker-dropdown">
          {AVAILABLE_ICON_NAMES.map(name => {
            const Icon = WORKSPACE_ICONS[name]
            return (
              <button
                key={name}
                type="button"
                className={`icon-picker-option${name === value ? ' selected' : ''}`}
                onClick={() => { onChange(name); setOpen(false) }}
              >
                <Icon size={16} />
                <span>{name}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface MigrationEntry {
  oldId: string
  matchedId: string
  confidence: 'high' | 'medium' | 'none'
}

function DocumentMigrationCard() {
  const [scanning, setScanning] = useState(false)
  const [orphanedIds, setOrphanedIds] = useState<string[]>([])
  const [currentDocs, setCurrentDocs] = useState<{ id: string; title: string; fileName: string }[]>([])
  const [mappings, setMappings] = useState<MigrationEntry[]>([])
  const [migrating, setMigrating] = useState(false)
  const [resultMsg, setResultMsg] = useState<{ ok: boolean; msg: string } | null>(null)

  const handleScan = async () => {
    setScanning(true)
    setResultMsg(null)
    try {
      const res = await fetch('/api/migrate-doc-ids')
      if (!res.ok) throw new Error('Scan failed')
      const data = await res.json() as { orphanedIds: string[]; currentDocs: { id: string; title: string; fileName: string }[] }
      setOrphanedIds(data.orphanedIds)
      setCurrentDocs(data.currentDocs)

      // Auto-match: extract filename from old ID and match
      const filenameToDocs = new Map<string, { id: string; title: string; fileName: string }[]>()
      for (const doc of data.currentDocs) {
        const fn = doc.fileName.toLowerCase()
        const list = filenameToDocs.get(fn) || []
        list.push(doc)
        filenameToDocs.set(fn, list)
      }

      const autoMappings: MigrationEntry[] = data.orphanedIds.map(oldId => {
        // Extract filename from ID: last segment after the prefix-category part
        const oldFileName = oldId.split('-').slice(2).join('-') + '.html'
        const exactMatch = filenameToDocs.get(oldFileName.toLowerCase())
        if (exactMatch && exactMatch.length === 1) {
          return { oldId, matchedId: exactMatch[0].id, confidence: 'high' }
        }

        // Try title substring match
        const titlePart = oldId.split('-').slice(2).join(' ')
        const titleMatches = data.currentDocs.filter(d =>
          d.title.toLowerCase().includes(titlePart.toLowerCase()) ||
          titlePart.toLowerCase().includes(d.title.toLowerCase())
        )
        if (titleMatches.length === 1) {
          return { oldId, matchedId: titleMatches[0].id, confidence: 'medium' }
        }

        return { oldId, matchedId: '', confidence: 'none' }
      })

      setMappings(autoMappings)
    } catch (e: any) {
      setResultMsg({ ok: false, msg: `Scan failed: ${e.message}` })
    } finally {
      setScanning(false)
    }
  }

  const updateMapping = (oldId: string, newId: string) => {
    setMappings(prev => prev.map(m => {
      if (m.oldId !== oldId) return m
      const confidence = newId === m.matchedId ? m.confidence : 'none'
      return { ...m, matchedId: newId, confidence: newId ? (confidence || 'none') : 'none' }
    }))
  }

  const handleMigrate = async () => {
    const validMappings: Record<string, string> = {}
    for (const m of mappings) {
      if (m.matchedId && m.oldId !== m.matchedId) {
        validMappings[m.oldId] = m.matchedId
      }
    }
    if (Object.keys(validMappings).length === 0) {
      setResultMsg({ ok: false, msg: 'No valid mappings to execute.' })
      return
    }

    setMigrating(true)
    setResultMsg(null)
    try {
      const res = await fetch('/api/migrate-doc-ids', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings: validMappings }),
      })
      if (!res.ok) throw new Error('Migration failed')
      const data = await res.json() as { success: boolean; rewritten: number }
      // Also migrate client-side localStorage
      const localCount = storageService.migrateDocumentIds(validMappings)
      setResultMsg({ ok: true, msg: `Migration complete. Rewrote ${data.rewritten} server + ${localCount} client records.` })
      setOrphanedIds([])
      setMappings([])
    } catch (e: any) {
      setResultMsg({ ok: false, msg: `Migration failed: ${e.message}` })
    } finally {
      setMigrating(false)
    }
  }

  return (
    <div className="cs-card">
      <div className="cs-card-header">DOCUMENT MIGRATION</div>
      <div className="cs-card-body">
        <div className="cs-card-desc">
          After restructuring workspaces (moving categories, renaming directories), document IDs change and existing data (annotations, read status, ratings, etc.) becomes orphaned. Use this tool to detect and remap orphaned IDs to their new counterparts.
        </div>

        <div className="cs-btn-group" style={{ marginBottom: mappings.length > 0 ? '0.75rem' : undefined }}>
          <button
            className="cs-btn cs-btn-primary"
            onClick={handleScan}
            disabled={scanning || migrating}
          >
            {scanning ? <Loader2 size={14} className="spin" /> : <ArrowRightLeft size={14} />}
            {scanning ? 'Scanning...' : 'Scan for Orphaned Data'}
          </button>
          {mappings.length > 0 && (
            <button
              className="cs-btn cs-btn-primary"
              onClick={handleMigrate}
              disabled={migrating || mappings.every(m => !m.matchedId)}
            >
              {migrating ? <Loader2 size={14} className="spin" /> : <ArrowRightLeft size={14} />}
              {migrating ? 'Migrating...' : `Execute Migration (${mappings.filter(m => m.matchedId).length})`}
            </button>
          )}
        </div>

        {orphanedIds.length === 0 && !scanning && mappings.length === 0 && !resultMsg && (
          <div className="cs-empty-hint">Click "Scan" to check for orphaned document IDs in your data files.</div>
        )}

        {mappings.length > 0 && (
          <div className="cs-migrate-table-wrap">
            <table className="cs-migrate-table">
              <thead>
                <tr>
                  <th>Old ID</th>
                  <th>Mapped To</th>
                  <th>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map(m => (
                  <tr key={m.oldId}>
                    <td className="cs-migrate-old-id" title={m.oldId}>
                      {m.oldId.length > 40 ? m.oldId.slice(0, 37) + '...' : m.oldId}
                    </td>
                    <td>
                      <select
                        className="cs-migrate-select"
                        value={m.matchedId}
                        onChange={e => updateMapping(m.oldId, e.target.value)}
                      >
                        <option value="">-- select --</option>
                        {currentDocs.map(doc => (
                          <option key={doc.id} value={doc.id}>
                            {doc.title || doc.id}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <span className={`cs-migrate-badge cs-migrate-badge-${m.confidence}`}>
                        {m.confidence === 'high' ? 'Exact' : m.confidence === 'medium' ? 'Partial' : 'Manual'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {resultMsg && (
          <div className={`cs-test-result ${resultMsg.ok ? 'success' : 'error'}`}>
            {resultMsg.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
            {resultMsg.msg}
          </div>
        )}
      </div>
    </div>
  )
}

function SimplifiedIdMigrationCard() {
  const [migrating, setMigrating] = useState(false)
  const [resultMsg, setResultMsg] = useState<{ ok: boolean; msg: string } | null>(null)

  const handleMigrate = async () => {
    setMigrating(true)
    setResultMsg(null)
    try {
      const res = await fetch('/api/migrate-to-simplified-ids', { method: 'POST' })
      if (!res.ok) throw new Error('Migration failed')
      const data = await res.json() as { success: boolean; totalMappings: number; mappings: Record<string, string> }

      if (data.totalMappings === 0) {
        setResultMsg({ ok: true, msg: 'Already migrated — no IDs need updating.' })
      } else {
        // Migrate client-side localStorage
        storageService.migrateDocumentIds(data.mappings)
        setResultMsg({ ok: true, msg: `Migration complete. ${data.totalMappings} IDs simplified. Reloading...` })
        // Reload after a brief delay so the user sees the success message
        setTimeout(() => window.location.reload(), 1500)
      }
    } catch (e: any) {
      setResultMsg({ ok: false, msg: `Migration failed: ${e.message}` })
    } finally {
      setMigrating(false)
    }
  }

  return (
    <div className="cs-card">
      <div className="cs-card-header">SIMPLIFIED DOCUMENT IDS</div>
      <div className="cs-card-body">
        <div className="cs-card-desc">
          Simplify document IDs from <code>prefix-category-filename</code> to <code>prefix-filename</code>, making IDs resilient to category restructuring. This is a one-time operation that rewrites all server data files and client storage, then regenerates manifests.
        </div>

        <div className="cs-btn-group">
          <button
            className="cs-btn cs-btn-primary"
            onClick={handleMigrate}
            disabled={migrating}
          >
            {migrating ? <Loader2 size={14} className="spin" /> : <Database size={14} />}
            {migrating ? 'Migrating...' : 'Migrate to Simplified IDs'}
          </button>
        </div>

        {resultMsg && (
          <div className={`cs-test-result ${resultMsg.ok ? 'success' : 'error'}`}>
            {resultMsg.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
            {resultMsg.msg}
          </div>
        )}
      </div>
    </div>
  )
}

export function SettingsPage() {
  const {
    quizDifficulty, quizQuestionCount, quizEnabledTypes,
    setQuizDifficulty, setQuizQuestionCount, setQuizEnabledTypes,
    conceptMaxCount, setConceptMaxCount,
    workspaces, addWorkspace, updateWorkspace, removeWorkspace,
    activeWorkspace,
    enabledFeatures, setEnabledFeatures,
    diagramSearchEngine, setDiagramSearchEngine,
  } = usePreferenceStore()

  // AI profiles state
  const [profiles, setProfiles] = useState<AIProfile[]>([])
  const [activeProfileId, setActiveProfileId] = useState('')
  const [visionProfileId, setVisionProfileId] = useState('')
  const [editingId, setEditingId] = useState('')
  const [editName, setEditName] = useState('')
  const [editUrl, setEditUrl] = useState('')
  const [editModel, setEditModel] = useState('')
  const [editApiKey, setEditApiKey] = useState('')
  const [isNewProfile, setIsNewProfile] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null)

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
        setVisionProfileId(cfg.visionProfileId || '')
        const active = (cfg.profiles || []).find((p: AIProfile) => p.id === cfg.activeProfileId)
        populateForm(active, active?.aiApiKey)
        if (cfg.quizDifficulty) setQuizDifficulty(cfg.quizDifficulty as Difficulty)
        if (cfg.quizQuestionCount) setQuizQuestionCount(cfg.quizQuestionCount)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const refreshFromResponse = async (res: Response) => {
    if (!res.ok) return
    const cfg: AIConfig = await res.json()
    setProfiles(cfg.profiles || [])
    setActiveProfileId(cfg.activeProfileId || '')
    setVisionProfileId(cfg.visionProfileId || '')
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
    if (confirmingDelete !== profileId) {
      setConfirmingDelete(profileId)
      return
    }
    setConfirmingDelete(null)
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

  const handleSetVisionProfile = async (id: string) => {
    setSaving(true)
    try {
      const res = await fetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setVisionProfile', visionProfileId: id }),
      })
      await refreshFromResponse(res)
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

  /** Sync quiz/concept settings to server (fire-and-forget) */
  const syncQuizToServer = (partial: Record<string, any>) => {
    fetch('/api/ai/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partial),
    }).catch(() => {})
  }

  const handleProfileClick = (p: AIProfile) => {
    populateForm(p, p.aiApiKey)
    setTestResult(null)
    setAvailableModels([])
  }


  // Workspace CRUD
  const reloadDocuments = useDocumentStore(s => s.reloadDocuments)

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
    reloadDocuments()
  }

  const handleDeleteWorkspace = (id: string) => {
    if (id === activeWorkspace) return
    if (confirmingDelete !== id) {
      setConfirmingDelete(id)
      return
    }
    setConfirmingDelete(null)
    removeWorkspace(id)
    syncWorkspacesToServer(workspaces.filter(w => w.id !== id))
    reloadDocuments()
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
    // Default to project root if path is empty
    const dirPath = currentPath || '.'
    setBrowseLoading(true)
    setBrowseOpen(true)
    try {
      const res = await fetch(`/api/browse-directories?path=${encodeURIComponent(dirPath)}`)
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
                          className="cs-btn cs-btn-secondary"
                          style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                          onClick={e => { e.stopPropagation(); handleSwitchProfile(p.id) }}
                          disabled={saving}
                        >
                          Activate
                        </button>
                        <button
                          className={`cs-btn cs-btn-secondary${confirmingDelete === p.id ? ' cs-btn-danger' : ''}`}
                          style={{ padding: '4px 8px' }}
                          onClick={e => { e.stopPropagation(); handleDeleteProfile(p.id) }}
                          disabled={saving}
                          title={confirmingDelete === p.id ? 'Click again to confirm' : 'Delete profile'}
                        >
                          <Trash2 size={13} />
                          {confirmingDelete === p.id && ' ?'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Vision profile selector */}
          {profiles.length > 0 && (
            <>
              <div className="cs-form-separator" style={{ marginTop: '1rem' }}>
                <div className="cs-section-label">VISION MODEL (for image analysis)</div>
              </div>
              <div className="cs-form-row">
                <div className="cs-form-group">
                  <label>Vision Profile</label>
                  <select
                    value={visionProfileId}
                    onChange={e => handleSetVisionProfile(e.target.value)}
                    disabled={saving || loading}
                  >
                    <option value="">Same as active</option>
                    {profiles.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.aiModel || 'no model'})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </>
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
              </div>
              <div className="cs-btn-group" style={{ marginTop: '0.5rem' }}>
                <button className="cs-btn cs-btn-primary" onClick={handleTestConnection} disabled={testing}>
                  <Zap size={14} /> {testing ? 'Testing...' : 'Test Connection'}
                </button>
                <button className="cs-btn cs-btn-secondary" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} />} Save
                </button>
                <button className="cs-btn cs-btn-secondary" onClick={() => populateForm(undefined)}>
                  Cancel
                </button>
              </div>
              {testResult && (
                <div className={`cs-test-result ${testResult.ok ? 'success' : 'error'}`}>
                  {testResult.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                  {testResult.msg}
                </div>
              )}
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
                      className={`cs-btn cs-btn-secondary${confirmingDelete === ws.id ? ' cs-btn-danger' : ''}`}
                      style={{ padding: '4px 8px' }}
                      onClick={e => { e.stopPropagation(); handleDeleteWorkspace(ws.id) }}
                      title={confirmingDelete === ws.id ? 'Click again to confirm' : 'Delete workspace'}
                    >
                      <Trash2 size={13} />
                      {confirmingDelete === ws.id && ' ?'}
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
                  <label>SUBTITLE</label>
                  <input
                    type="text"
                    value={editingWs.subtitle || ''}
                    onChange={e => setEditingWs({ ...editingWs, subtitle: e.target.value })}
                    placeholder="e.g.: Mind & Insight"
                  />
                </div>
              </div>
              <div className="cs-form-row">
                <div className="cs-form-group">
                  <label>ICON</label>
                  <IconPicker value={editingWs.icon} onChange={icon => setEditingWs({ ...editingWs, icon })} />
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
                <button className="cs-btn cs-btn-secondary" onClick={() => { setEditingWs(null); setIsNewWs(false) }}>
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

      {/* Card 4: Quiz & Concept Settings */}
      <div className="cs-card">
        <div className="cs-card-header">QUIZ & CONCEPT SETTINGS</div>
        <div className="cs-card-body">
          <div className="cs-form-row">
            <div className="cs-form-group">
              <label>QUIZ DIFFICULTY</label>
              <select
                value={quizDifficulty}
                onChange={e => {
                  const v = e.target.value as Difficulty
                  setQuizDifficulty(v)
                  syncQuizToServer({ quizDifficulty: v })
                }}
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
                value={quizQuestionCount}
                onChange={e => {
                  const raw = e.target.value.replace(/[^0-9]/g, '')
                  const n = Math.max(1, Math.min(20, Number(raw) || 10))
                  setQuizQuestionCount(n)
                  syncQuizToServer({ quizQuestionCount: n })
                }}
              />
            </div>
            <div className="cs-form-group">
              <label>CONCEPT COUNT</label>
              <input
                type="text"
                inputMode="numeric"
                value={conceptMaxCount}
                onChange={e => {
                  const raw = e.target.value.replace(/[^0-9]/g, '')
                  const n = Math.max(1, Math.min(50, Number(raw) || 10))
                  setConceptMaxCount(n)
                  syncQuizToServer({ conceptMaxCount: n })
                }}
              />
            </div>
          </div>
          <div className="cs-form-row" style={{ marginTop: '0.5rem' }}>
            <div className="cs-form-group" style={{ gridColumn: '1 / -1' }}>
              <label>QUESTION TYPES</label>
              <div className="cs-question-types">
                {([
                  { type: 'choice' as QuestionType, label: 'Multiple Choice' },
                  { type: 'truefalse' as QuestionType, label: 'True/False' },
                  { type: 'fill_blank' as QuestionType, label: 'Fill in Blank' },
                  { type: 'short_answer' as QuestionType, label: 'Short Answer' },
                  { type: 'code_completion' as QuestionType, label: 'Code Completion' },
                ]).map(({ type, label }) => (
                  <label key={type} className="cs-question-type-item">
                    <input
                      type="checkbox"
                      checked={quizEnabledTypes.includes(type)}
                      onChange={e => {
                        const next = e.target.checked
                          ? [...quizEnabledTypes, type]
                          : quizEnabledTypes.filter(t => t !== type)
                        setQuizEnabledTypes(next)
                        syncQuizToServer({ quizEnabledTypes: next })
                      }}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Card: Diagram Search */}
      <div className="cs-card">
        <div className="cs-card-header">DIAGRAM SEARCH</div>
        <div className="cs-card-body">
          <div className="cs-card-desc">
            Choose the search engine used when searching for architecture diagrams in the document reader.
          </div>
          <label className="cs-select">
            <select
              value={diagramSearchEngine}
              onChange={e => setDiagramSearchEngine(e.target.value as 'google' | 'bing')}
            >
              <option value="google">Google Images</option>
              <option value="bing">Bing Images</option>
            </select>
          </label>
        </div>
      </div>

      {/* Card: Feature Toggles */}
      <div className="cs-card">
        <div className="cs-card-header">FEATURE TOGGLES</div>
        <div className="cs-card-body">
          <div className="cs-card-desc">
            Enable or disable AI-powered features. Disabling a feature only hides its button — existing data is preserved.
          </div>
          <div className="cs-question-types">
            {([
              { key: 'aiSummary' as FeatureKey, label: 'AI Summary' },
              { key: 'aiInception' as FeatureKey, label: 'AI Inception' },
              { key: 'aiEvaluation' as FeatureKey, label: 'AI Evaluation' },
              { key: 'aiQuiz' as FeatureKey, label: 'AI Quiz' },
              { key: 'aiConcept' as FeatureKey, label: 'AI Concept Extraction' },
              { key: 'aiSimilarity' as FeatureKey, label: 'Document Similarity' },
            ]).map(({ key, label }) => (
              <label key={key} className="cs-question-type-item">
                <input
                  type="checkbox"
                  checked={enabledFeatures[key]}
                  onChange={e => {
                    setEnabledFeatures({ ...enabledFeatures, [key]: e.target.checked })
                  }}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Card 5: Data Management */}
      <div className="cs-card">
        <div className="cs-card-header">DATA MANAGEMENT</div>
        <div className="cs-card-body">
          <div className="cs-card-desc">
            Export all learning data (reading history, annotations, tags, quizzes, concept cards, achievements, etc.) as a JSON file for backup or migration to other devices.
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

      <DocumentMigrationCard />
      <SimplifiedIdMigrationCard />

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
              <button className="cs-btn cs-btn-secondary" disabled={!browsePath || browsePath === '/'} onClick={() => { if (!browsePath) return; const i = browsePath.lastIndexOf('/'); if (i > 0) navigateDir(browsePath.slice(0, i)) }}>
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
