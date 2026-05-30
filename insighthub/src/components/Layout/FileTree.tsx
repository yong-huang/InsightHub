import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ChevronRight, Folder, FolderOpen, FileText, CheckCircle2, EyeOff } from 'lucide-react'
import { useDocumentStore } from '@/stores/documentStore'
import { usePreferenceStore } from '@/stores/preferenceStore'
import { storageService } from '@/services/storageService'

interface TreeNode {
  name: string
  path: string
  isDir: boolean
  children: TreeNode[]
  docId?: string
  docCount?: number
  isRead?: boolean
}

/** Cached uppercase for directory labels */
const upperCache = new Map<string, string>()
function toUpperCached(s: string): string {
  let v = upperCache.get(s)
  if (v === undefined) { v = s.toUpperCase(); upperCache.set(s, v) }
  return v
}

function buildTree(filePaths: { filePath: string; docId: string; isRead: boolean }[]): TreeNode[] {
  const root: TreeNode[] = []

  const sorted = [...filePaths].sort((a, b) => a.filePath.localeCompare(b.filePath))

  for (const { filePath, docId, isRead } of sorted) {
    // filePath like: academic/article.html or algorithms/binary-search/doc.html
    const parts = filePath.split('/').filter(Boolean)

    let currentLevel = root

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isFile = i === parts.length - 1 && part.endsWith('.html')
      const currentPath = parts.slice(0, i + 1).join('/')

      if (isFile) {
        currentLevel.push({
          name: part.replace(/\.html$/, ''),
          path: currentPath,
          isDir: false,
          children: [],
          docId,
          isRead,
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

  for (const node of root) {
    countDocs(node)
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
}) {
  const isExpanded = expandedPaths.has(node.path)

  if (node.isDir) {
    // Top-level directory = category → uppercase label + click navigates to category page
    const isTopLevel = depth === 0
    return (
      <div className="file-tree-node">
        <div
          className={`file-tree-row is-dir${isExpanded ? ' expanded' : ''}`}
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
          <span className="file-tree-label">{isTopLevel ? toUpperCached(node.name) : node.name}</span>
          {node.docCount !== undefined && (
            <span className="file-tree-count">{node.docCount}</span>
          )}
          {isTopLevel && onHideCategory && (
            <span
              className="file-tree-hide-btn"
              onClick={e => { e.stopPropagation(); onHideCategory(node.path) }}
              title="Hide category"
            >
              <EyeOff size={12} />
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
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  // File node — show read status
  const isActive = activeDocId === node.docId

  return (
    <div className="file-tree-node">
      <div
        className={`file-tree-row${isActive ? ' active' : ''}`}
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
      </div>
    </div>
  )
}

export function FileTree() {
  const documents = useDocumentStore(s => s.documents)
  const activeWorkspace = usePreferenceStore(s => s.activeWorkspace)
  const sidebarCollapsed = usePreferenceStore(s => s.sidebarCollapsed)
  const navigate = useNavigate()
  const location = useLocation()

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
    const result: { filePath: string; docId: string; isRead: boolean }[] = []
    const prefix = wsDirName ? `../${wsDirName}/` : ''
    for (const [docId, doc] of documents.entries()) {
      if (doc.source === activeWorkspace && !doc.isDeprecated && !deprecatedCats.has(`${activeWorkspace}:${doc.category}`) && doc.filePath) {
        const fp = prefix && doc.filePath.startsWith(prefix)
          ? doc.filePath.slice(prefix.length)
          : doc.filePath
        result.push({ filePath: fp, docId, isRead: doc.isRead })
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

  // Auto-expand first level if no saved state (only once when tree is ready)
  const hasAutoExpanded = useRef<string | null>(null)
  useEffect(() => {
    if (tree.length === 0 || !activeWorkspace) return
    if (hasAutoExpanded.current === activeWorkspace) return
    const saved = usePreferenceStore.getState().expandedTreePaths[activeWorkspace]
    if (saved?.length > 0) {
      hasAutoExpanded.current = activeWorkspace
      setExpandedPaths(new Set(saved))
    } else if (tree.length === 1 && tree[0].isDir) {
      hasAutoExpanded.current = activeWorkspace
      setExpandedPaths(new Set([tree[0].path]))
      usePreferenceStore.getState().setExpandedTreePaths(activeWorkspace, [tree[0].path])
    }
  }, [tree, activeWorkspace])

  // Persist expanded paths to store on every change
  useEffect(() => {
    usePreferenceStore.getState().setExpandedTreePaths(activeWorkspace, [...expandedPaths])
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

  // Current active docId from URL
  const activeDocId = location.pathname.startsWith('/doc/')
    ? location.pathname.replace('/doc/', '')
    : undefined

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
        />
      ))}
    </div>
  )
}
