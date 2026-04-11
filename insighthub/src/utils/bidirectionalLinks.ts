import type { Document, Annotation } from '@/types'

const WIKI_LINK_RE = /\[\[([^\]]+)\]\]/g

/** Parse [[title]] patterns from text, return array of matched titles */
export function parseWikiLinks(text: string): string[] {
  const titles: string[] = []
  let match: RegExpExecArray | null
  const re = new RegExp(WIKI_LINK_RE.source, WIKI_LINK_RE.flags)
  while ((match = re.exec(text)) !== null) {
    titles.push(match[1].trim())
  }
  return titles
}

/** Build a lookup Map from document title → document id */
export function buildTitleLookup(documents: Map<string, Document>): Map<string, string> {
  const lookup = new Map<string, string>()
  for (const doc of documents.values()) {
    lookup.set(doc.title, doc.id)
  }
  return lookup
}

/** Resolve a wiki-link title to a docId, or null if not found */
export function resolveWikiLink(title: string, lookup: Map<string, string>): string | null {
  return lookup.get(title) ?? null
}

/** Find all annotations that contain [[targetDocTitle]] in their comment */
export function findBacklinks(
  targetDocId: string,
  annotations: Annotation[],
  lookup: Map<string, string>,
): Annotation[] {
  return annotations.filter(ann => {
    if (!ann.comment) return false
    const titles = parseWikiLinks(ann.comment)
    return titles.some(title => resolveWikiLink(title, lookup) === targetDocId)
  })
}
