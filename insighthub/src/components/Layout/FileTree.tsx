import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
import { ChevronRight, Folder, FolderOpen, FileText, CheckCircle2, EyeOff, ArrowRightLeft, Trash2 } from 'lucide-react'
import { useDocumentStore } from '@/stores/documentStore'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { storageService } from '@/services/storageService'
import { MoveCategoryDialog } from '@/components/Import/MoveCategoryDialog'
import { MoveDocumentDialog } from '@/components/Import/MoveDocumentDialog'

interface TreeNode {
  name: string
  path: string
  isDir: boolean
  children: TreeNode[]
  docId?: string
  docCount?: number
  readCount?: number
  isRead?: boolean
  rating?: number
}

/** Cached lowercase for directory labels */
const lowerCache = new Map<string, string>()
function toLowerCached(s: string): string {
  let v = lowerCache.get(s)
  if (v === undefined) { v = s.toLowerCase(); lowerCache.set(s, v) }
  return v
}

const FILE_EXTENSIONS = new Set([
  '.html', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico', '.avif', '.tiff', '.tif',
])

function getFileExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot).toLowerCase() : ''
}

function buildTree(filePaths: { filePath: string; docId: string; isRead: boolean; rating?: number }[]): TreeNode[] {
  const root: TreeNode[] = []

  const sorted = [...filePaths].sort((a, b) => a.filePath.localeCompare(b.filePath))

  for (const { filePath, docId, isRead, rating } of sorted) {
    // filePath like: academic/article.html or algorithms/binary-search/doc.html
    const parts = filePath.split('/').filter(Boolean)

    let currentLevel = root

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const ext = getFileExtension(part)
      const isFile = i === parts.length - 1 && FILE_EXTENSIONS.has(ext)
      const currentPath = parts.slice(0, i + 1).join('/')

      if (isFile) {
        const name = FILE_EXTENSIONS.has(ext) ? part.slice(0, -ext.length) : part
        currentLevel.push({
          name,
          path: currentPath,
          isDir: false,
          children: [],
          docId,
          isRead,
          rating,
        })
      } else {
        let existing = currentLevel.find(n => n.isDir && n.name === part)
        if (!existing) {
          existing = {
            name: part,
            path: currentPath,
            isDir: true,
            children: [],
            docCount: 0,
          }
          currentLevel.push(existing)
        }
        currentLevel = existing.children
      }
    }
  }

  // Compute doc counts for directories
  function countDocs(node: TreeNode): number {
    if (!node.isDir) return 1
    const count = node.children.reduce((sum, child) => sum + countDocs(child), 0)
    node.docCount = count
    return count
  }

  // Compute read doc counts for directories
  function countReadDocs(node: TreeNode): number {
    if (!node.isDir) return node.isRead ? 1 : 0
    const count = node.children.reduce((sum, child) => sum + countReadDocs(child), 0)
    node.readCount = count
    return count
  }

  for (const node of root) {
    countDocs(node)
    countReadDocs(node)
  }

  return root
}

function TreeNodeView({
  node,
  depth,
  expandedPaths,
  toggleExpand,
  activeDocId,
  onDocClick,
  activeWorkspace,
  navigate,
  onHideCategory,
  onMoveCategory,
  onDeleteCategory,
  deleteArmed,
  onDeleteDoc,
  deleteDocArmed,
  onMoveDoc,
}: {
  node: TreeNode
  depth: number
  expandedPaths: Set<string>
  toggleExpand: (path: string) => void
  activeDocId: string | undefined
  onDocClick: (docId: string) => void
  activeWorkspace: string
  navigate: ReturnType<typeof useNavigate>
  onHideCategory?: (categoryPath: string) => void
  onMoveCategory?: (categoryPath: string, docCount: number) => void
  onDeleteCategory?: (categoryPath: string) => void
  deleteArmed?: boolean
  onDeleteDoc?: (docId: string) => void
  deleteDocArmed?: boolean
  onMoveDoc?: (docId: string) => void
}) {
  const isExpanded = expandedPaths.has(node.path)

  if (node.isDir) {
    // Top-level directory = category → uppercase label + click navigates to category page
    const isTopLevel = depth === 0
    return (
      <div className="file-tree-node">
        <div
          className={`file-tree-row is-dir${isExpanded ? ' expanded' : ''}`}
          style={node.docCount != null && node.docCount > 0 ? {
            '--read-pct': `${(node.readCount || 0) / node.docCount * 100}%`,
          } as React.CSSProperties : undefined}
          onClick={isTopLevel ? () => navigate(`/${activeWorkspace}/${node.path}`) : undefined}
        >
          <span
            className={`file-tree-chevron${isExpanded ? ' expanded' : ''}`}
            onClick={e => { e.stopPropagation(); toggleExpand(node.path) }}
          >
            <ChevronRight size={14} />
          </span>
          <span className="file-tree-icon">
            {isExpanded ? <FolderOpen size={16} /> : <Folder size={16} />}
          </span>
          <span className="file-tree-label">{isTopLevel ? toLowerCached(node.name) : node.name}</span>
          {node.docCount !== undefined && (
            <span className="file-tree-count">{node.docCount}</span>
          )}
          {isTopLevel && (onHideCategory || onMoveCategory || onDeleteCategory) && (
            <span className="file-tree-actions">
              {onHideCategory && (
                <span
                  className="file-tree-hide-btn"
                  onClick={e => { e.stopPropagation(); onHideCategory(node.path) }}
                  title="Hide category"
                >
                  <EyeOff size={12} />
                </span>
              )}
              {onMoveCategory && (
                <span
                  className="file-tree-hide-btn"
                  onClick={e => { e.stopPropagation(); onMoveCategory(node.path, node.docCount || 0) }}
                  title="Move category"
                >
                  <ArrowRightLeft size={12} />
                </span>
              )}
              {onDeleteCategory && (
                <span
                  className={`file-tree-hide-btn${deleteArmed ? ' file-tree-action-danger' : ''}`}
                  onClick={e => { e.stopPropagation(); onDeleteCategory(node.path) }}
                  title={deleteArmed ? 'Click again to confirm delete' : 'Delete category'}
                >
                  <Trash2 size={12} />
                </span>
              )}
            </span>
          )}
        </div>
        {isExpanded && (
          <div className="file-tree-children">
            {node.children.map(child => (
              <TreeNodeView
                key={child.path}
                node={child}
                depth={depth + 1}
                expandedPaths={expandedPaths}
                toggleExpand={toggleExpand}
                activeDocId={activeDocId}
                onDocClick={onDocClick}
                activeWorkspace={activeWorkspace}
                navigate={navigate}
                onHideCategory={onHideCategory}
                onMoveCategory={onMoveCategory}
                onDeleteCategory={onDeleteCategory}
                deleteArmed={deleteArmed}
                onDeleteDoc={onDeleteDoc}
                deleteDocArmed={deleteDocArmed}
                onMoveDoc={onMoveDoc}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  // File node — show read status + rating background
  const isActive = activeDocId === node.docId
  const ratingClass = node.rating ? ` rating-${node.rating}` : ''

  return (
    <div className="file-tree-node">
      <div
        className={`file-tree-row${isActive ? ' active' : ''}${ratingClass}`}
        onClick={() => node.docId && onDocClick(node.docId)}
      >
        <span style={{ width: 16 }} />
        <span className="file-tree-icon">
          {node.isRead
            ? <CheckCircle2 size={14} style={{ color: 'var(--accent-green)' }} />
            : <FileText size={14} />
          }
        </span>
        <span className="file-tree-label">{node.name}</span>
        {(onMoveDoc || onDeleteDoc) && node.docId && (
          <span className="file-tree-actions">
            {onMoveDoc && (
              <span
                className="file-tree-hide-btn"
                onClick={e => { e.stopPropagation(); onMoveDoc(node.docId!) }}
                title="Move document"
              >
                <ArrowRightLeft size={12} />
              </span>
            )}
            {onDeleteDoc && (
              <span
                className={`file-tree-hide-btn${deleteDocArmed ? ' file-tree-action-danger' : ''}`}
                onClick={e => { e.stopPropagation(); onDeleteDoc(node.docId!) }}
                title={deleteDocArmed ? 'Click again to confirm delete' : 'Delete document'}
              >
                <Trash2 size={12} />
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  )
}

export function FileTree() {
  const documents = useDocumentStore(s => s.documents)
  const activeWorkspace = usePreferenceStore(s => s.activeWorkspace)
  const sidebarCollapsed = usePreferenceStore(s => s.sidebarCollapsed)
  const trashDocument = useDocumentStore(s => s.trashDocument)
  const navigate = useNavigate()
  const location = useLocation()

  const [moveCategoryTarget, setMoveCategoryTarget] = useState<{ category: string; docCount: number } | null>(null)
  const [moveDocTarget, setMoveDocTarget] = useState<string | null>(null)
  const [deleteArmedCategory, setDeleteArmedCategory] = useState<string | null>(null)
  const [deleteArmedDoc, setDeleteArmedDoc] = useState<string | null>(null)
  const deleteArmTimer = useRef<ReturnType<typeof setTimeout>>()

  // Auto-disarm delete after 3s
  useEffect(() => {
    if (deleteArmedCategory) {
      deleteArmTimer.current = setTimeout(() => setDeleteArmedCategory(null), 3000)
      return () => clearTimeout(deleteArmTimer.current)
    }
  }, [deleteArmedCategory])
  useEffect(() => {
    if (deleteArmedDoc) {
      const t = setTimeout(() => setDeleteArmedDoc(null), 3000)
      return () => clearTimeout(t)
    }
  }, [deleteArmedDoc])

  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => {
    const saved = usePreferenceStore.getState().expandedTreePaths[activeWorkspace]
    return new Set(saved || [])
  })
  const [deprecatedCats, setDeprecatedCats] = useState<Set<string>>(() =>
    new Set(storageService.getDeprecatedCategories())
  )

  // Sync deprecated categories from localStorage
  useMemo(() => {
    const handler = () => setDeprecatedCats(new Set(storageService.getDeprecatedCategories()))
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  // Get workspace directory name (last segment of workspace path) for stripping from filePath
  const wsDirName = usePreferenceStore(
    s => s.workspaces.find(w => w.id === activeWorkspace)?.path.split('/').filter(Boolean).pop() || ''
  )

  // Build file tree from workspace documents, stripping the leading ../<workspaceDir>/ prefix
  const filePaths = useMemo(() => {
    const result: { filePath: string; docId: string; isRead: boolean; rating?: number }[] = []
    const prefix = wsDirName ? `../${wsDirName}/` : ''
    for (const [docId, doc] of documents.entries()) {
      if (doc.source === activeWorkspace && !doc.isDeprecated && !deprecatedCats.has(`${activeWorkspace}:${doc.category}`) && doc.filePath) {
        const fp = prefix && doc.filePath.startsWith(prefix)
          ? doc.filePath.slice(prefix.length)
          : doc.filePath
        result.push({ filePath: fp, docId, isRead: doc.isRead, rating: doc.rating })
      }
    }
    return result
  }, [documents, activeWorkspace, wsDirName, deprecatedCats])

  const tree = useMemo(() => buildTree(filePaths), [filePaths])

  // Filter tree by deprecated top-level categories
  const filteredTree = useMemo(() => {
    if (deprecatedCats.size === 0) return tree
    return tree.filter(node => !deprecatedCats.has(`${activeWorkspace}:${node.path}`))
  }, [tree, deprecatedCats, activeWorkspace])

  // Load saved expanded paths when workspace changes; auto-expand first level if no saved state
  const hasAutoExpanded = useRef<string | null>(null)
  useEffect(() => {
    if (tree.length === 0 || !activeWorkspace) return
    const saved = usePreferenceStore.getState().expandedTreePaths[activeWorkspace]
    if (saved?.length > 0) {
      expandedPathsWs.current = activeWorkspace
      setExpandedPaths(new Set(saved))
    } else if (hasAutoExpanded.current !== activeWorkspace && tree.length === 1 && tree[0].isDir) {
      hasAutoExpanded.current = activeWorkspace
      expandedPathsWs.current = activeWorkspace
      setExpandedPaths(new Set([tree[0].path]))
      usePreferenceStore.getState().setExpandedTreePaths(activeWorkspace, [tree[0].path])
    }
  }, [tree, activeWorkspace])

  // Track the workspace that expandedPaths currently belongs to, to avoid
  // persisting stale paths when activeWorkspace changes (race condition).
  const expandedPathsWs = useRef(activeWorkspace)

  // Persist expanded paths to store — only when paths belong to the current workspace
  useEffect(() => {
    if (expandedPathsWs.current === activeWorkspace) {
      usePreferenceStore.getState().setExpandedTreePaths(activeWorkspace, [...expandedPaths])
    }
  }, [expandedPaths, activeWorkspace])

  const toggleExpand = useCallback((path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  const onDocClick = useCallback((docId: string) => {
    navigate(`/doc/${docId}`)
  }, [navigate])

  const onHideCategory = useCallback((categoryPath: string) => {
    storageService.setDeprecatedCategory(activeWorkspace, categoryPath)
    setDeprecatedCats(new Set(storageService.getDeprecatedCategories()))
    window.dispatchEvent(new Event('storage'))
    useDocumentStore.getState().applyFilters()
  }, [activeWorkspace])

  const onMoveCategory = useCallback((categoryPath: string, docCount: number) => {
    setMoveCategoryTarget({ category: categoryPath, docCount })
  }, [])

  const onDeleteCategory = useCallback((categoryPath: string) => {
    // Two-click confirm pattern
    if (deleteArmedCategory !== categoryPath) {
      setDeleteArmedCategory(categoryPath)
      return
    }

    setDeleteArmedCategory(null)
    clearTimeout(deleteArmTimer.current)

    // Trash all documents in this category (client-side only, files stay on disk)
    for (const [docId, doc] of documents.entries()) {
      if (doc.source === activeWorkspace && doc.category === categoryPath && !doc.isDeprecated) {
        trashDocument(docId)
      }
    }
  }, [activeWorkspace, deleteArmedCategory, documents, trashDocument])

  // Current active docId from URL (decode to match docIds with non-ASCII chars)
  const activeDocId = location.pathname.startsWith('/doc/')
    ? decodeURIComponent(location.pathname.replace('/doc/', ''))
    : undefined

  const onDeleteDoc = useCallback((docId: string) => {
    // Two-click confirm pattern
    if (deleteArmedDoc !== docId) {
      setDeleteArmedDoc(docId)
      return
    }

    setDeleteArmedDoc(null)

    // Find adjacent document in the tree (same category, next/previous sibling)
    const idx = filePaths.findIndex(f => f.docId === docId)
    const nextDocId = idx >= 0
      ? (filePaths[idx + 1] || filePaths[idx - 1])?.docId
      : filePaths[0]?.docId

    trashDocument(docId)

    // Navigate: to adjacent doc if deleting active doc, or stay
    if (activeDocId === docId) {
      if (nextDocId) {
        navigate(`/doc/${nextDocId}`)
      } else {
        navigate(`/${activeWorkspace}`)
      }
    }
  }, [deleteArmedDoc, filePaths, activeDocId, trashDocument, navigate, activeWorkspace])

  const onMoveDoc = useCallback((docId: string) => {
    setMoveDocTarget(docId)
  }, [])

  const handleDocMoved = useCallback((newId: string) => {
    setMoveDocTarget(null)
    if (activeDocId) {
      navigate(`/doc/${newId}`, { replace: true })
    }
  }, [activeDocId, navigate])

  if (sidebarCollapsed) {
    return null
  }

  if (filteredTree.length === 0) {
    return (
      <div style={{ padding: '1rem', color: 'var(--text-dim)', fontSize: '0.8rem' }}>
        No Documents
      </div>
    )
  }

  return (
    <div className="file-tree">
      {filteredTree.map(node => (
        <TreeNodeView
          key={node.path}
          node={node}
          depth={0}
          expandedPaths={expandedPaths}
          toggleExpand={toggleExpand}
          activeDocId={activeDocId}
          onDocClick={onDocClick}
          activeWorkspace={activeWorkspace}
          navigate={navigate}
          onHideCategory={onHideCategory}
          onMoveCategory={onMoveCategory}
          onDeleteCategory={onDeleteCategory}
          deleteArmed={deleteArmedCategory === node.path}
          onDeleteDoc={onDeleteDoc}
          deleteDocArmed={deleteArmedDoc !== null}
          onMoveDoc={onMoveDoc}
        />
      ))}
      {moveCategoryTarget && createPortal(
        <MoveCategoryDialog
          workspaceId={activeWorkspace}
          category={moveCategoryTarget.category}
          docCount={moveCategoryTarget.docCount}
          onClose={() => setMoveCategoryTarget(null)}
        />,
        document.body,
      )}
      {moveDocTarget && (() => {
        const doc = documents.get(moveDocTarget)
        return doc && createPortal(
          <MoveDocumentDialog
            doc={doc}
            onClose={() => setMoveDocTarget(null)}
            onMoved={handleDocMoved}
          />,
          document.body,
        )
      })()}
    </div>
  )
}
