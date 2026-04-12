function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Markdown → HTML for AI summaries: headers, lists, bold, italic, code, blockquotes */
export function renderMarkdown(text: string): string {
  // Extract fenced code blocks first to protect them from further processing
  const codeBlocks: string[] = []
  let html = text.replace(/```[\s\S]*?```/g, (match) => {
    codeBlocks.push(match)
    return `%%CODEBLOCK_${codeBlocks.length - 1}%%`
  })

  // Inline code (before bold/italic to avoid conflicts)
  html = html.replace(/`([^`]+)`/g, '<code class="summary-md-code">$1</code>')

  // # headers
  html = html.replace(/^#### (.+)$/gm, '<h5 class="summary-md-h5">$1</h5>')
  html = html.replace(/^### (.+)$/gm, '<h4 class="summary-md-h4">$1</h4>')
  html = html.replace(/^## (.+)$/gm, '<h3 class="summary-md-h3">$1</h3>')
  html = html.replace(/^# (.+)$/gm, '<h2 class="summary-md-h2">$1</h2>')

  // Bold **text**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  // Italic *text*
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')

  // Blockquotes > text
  html = html.replace(/^>\s?(.+)$/gm, '<blockquote class="summary-md-bq">$1</blockquote>')

  // List items - text (indented or not)
  html = html.replace(/^(\s*)[-*] (.+)$/gm, (_, indent, content) => {
    const level = Math.floor(indent.length / 2)
    return `<li class="summary-md-li" style="margin-left:${level * 1.2}rem">${content}</li>`
  })
  // Numbered list
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="summary-md-li">$1</li>')

  // Wrap consecutive <li> in <ul>
  html = html.replace(/((?:<li class="summary-md-li"[^>]*>.*<\/li>\n?)+)/g, '<ul class="summary-md-ul">$1</ul>')

  // Horizontal rule
  html = html.replace(/^---+$/gm, '<hr class="summary-md-hr">')

  // Convert remaining newlines to <br> within paragraphs
  html = html.replace(/^(?!<[%hulo]|<\/|%%)(.+)$/gm, '<p class="summary-md-p">$1</p>')

  // Restore code blocks
  html = html.replace(/%%CODEBLOCK_(\d+)%%/g, (_, idx) => {
    const block = codeBlocks[parseInt(idx)]
    const content = block.replace(/```\w*\n?/, '').replace(/\n?```$/, '')
    return `<pre class="summary-md-pre"><code>${escapeHtml(content.trim())}</code></pre>`
  })

  return html
}
