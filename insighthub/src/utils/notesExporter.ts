import type { Annotation } from '@/types'

interface ExportOptions {
  annotations: Annotation[]
  getDocTitle: (docId: string) => string
}

/** Group annotations by document, then render as Markdown */
function groupByDocument(annotations: Annotation[]): Map<string, Annotation[]> {
  const map = new Map<string, Annotation[]>()
  for (const ann of annotations) {
    let group = map.get(ann.documentId)
    if (!group) {
      group = []
      map.set(ann.documentId, group)
    }
    group.push(ann)
  }
  return map
}

export function exportNotesAsMarkdown({ annotations, getDocTitle }: ExportOptions): void {
  const groups = groupByDocument(annotations)
  const lines: string[] = ['# 笔记导出', '', `导出时间：${new Date().toLocaleString('zh-CN')}`, '']

  for (const [docId, anns] of groups) {
    const title = getDocTitle(docId)
    lines.push(`## ${title}`, '')

    // Sort by creation time
    const sorted = anns.slice().sort((a, b) => a.createdAt - b.createdAt)
    for (const ann of sorted) {
      lines.push(`> ${ann.text.replace(/\n/g, '\n> ')}`, '')
      if (ann.comment) {
        lines.push(`**批注**：${ann.comment}`, '')
      }
      lines.push('---', '')
    }
  }

  const content = lines.join('\n')
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `insighthub-notes-${new Date().toISOString().slice(0, 10)}.md`
  a.click()
  URL.revokeObjectURL(url)
}
