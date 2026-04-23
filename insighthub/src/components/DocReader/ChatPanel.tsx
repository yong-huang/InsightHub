import { useState, useRef, useEffect, useCallback, type RefObject } from 'react'
import { X, Trash2, Send, Loader2, Square, Pencil, Check } from 'lucide-react'
import { renderMarkdown } from '@/utils/markdownRenderer'
import { chatWithDocument, type ChatMessage } from '@/services/readerAiService'
import { storageService } from '@/services/storageService'

interface ChatPanelProps {
  documentId: string
  documentTitle: string
  documentContent: string
  iframeRef: RefObject<HTMLIFrameElement | null>
  selectedText?: string
  onClose: () => void
  onSelectionUsed?: () => void
}

export function ChatPanel({
  documentId, documentTitle, documentContent, iframeRef,
  selectedText, onClose, onSelectionUsed,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState<string | null>(null)
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [activeSelectedText, setActiveSelectedText] = useState<string | undefined>(selectedText)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const editTextareaRef = useRef<HTMLTextAreaElement>(null)
  const docContentRef = useRef<string | null>(null)
  const userScrolledUp = useRef(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const streamingTextRef = useRef<string>('')

  // Keep ref in sync for abort handler
  useEffect(() => {
    streamingTextRef.current = streamingText ?? ''
  }, [streamingText])

  // Cache document content on first access
  const getDocContent = useCallback(() => {
    if (docContentRef.current) return docContentRef.current
    try {
      const text = iframeRef.current?.contentDocument?.body?.textContent
      if (text) {
        docContentRef.current = text
        return text
      }
    } catch {}
    docContentRef.current = documentContent
    return documentContent
  }, [iframeRef, documentContent])

  // Track whether user has scrolled up away from the bottom
  useEffect(() => {
    const el = messagesRef.current
    if (!el) return
    const handleScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
      userScrolledUp.current = !atBottom
    }
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [])

  // Auto-scroll to bottom only when user is near the bottom
  useEffect(() => {
    if (!userScrolledUp.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, streamingText])

  // Sync selectedText from parent
  useEffect(() => {
    if (selectedText) {
      setActiveSelectedText(selectedText)
    }
  }, [selectedText])

  // Load chat history on mount / document change
  useEffect(() => {
    const saved = storageService.getChatHistory(documentId)
    setMessages(saved)
    setStreamingText(null)
    setIsStreaming(false)
    setEditingMsgId(null)
    // Don't clear selectedText if it was just passed in
    if (!selectedText) {
      setActiveSelectedText(undefined)
    }
    docContentRef.current = null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId])

  // Persist messages whenever they change (skip initial load)
  const initialLoadRef = useRef(true)
  useEffect(() => {
    if (initialLoadRef.current) {
      initialLoadRef.current = false
      return
    }
    if (messages.length === 0) {
      storageService.deleteChatHistory(documentId)
    } else {
      storageService.saveChatHistory(documentId, messages)
    }
  }, [messages, documentId])

  const doSend = useCallback(async (msgs: ChatMessage[], userText: string, withSelected?: string) => {
    setIsStreaming(true)
    userScrolledUp.current = false
    setStreamingText('')
    streamingTextRef.current = ''

    const controller = new AbortController()
    abortControllerRef.current = controller

    let finalUserText = userText
    if (withSelected) {
      finalUserText = `关于以下选中文本：\n「${withSelected}」\n\n用户问题：${userText}`
    }

    const docCtx = getDocContent()
    const result = await chatWithDocument(
      docCtx,
      msgs,
      finalUserText,
      (chunk) => {
        setStreamingText(chunk)
        streamingTextRef.current = chunk
      },
      controller.signal,
    )

    abortControllerRef.current = null
    setIsStreaming(false)

    // On external abort, use the accumulated streaming text
    const isAborted = controller.signal.aborted
    if (isAborted && streamingTextRef.current) {
      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: streamingTextRef.current,
        timestamp: Date.now(),
      }
      setMessages(prev => [...prev, assistantMsg])
    } else if (result.success && result.data) {
      const assistantMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: result.data,
        timestamp: Date.now(),
      }
      setMessages(prev => [...prev, assistantMsg])
    } else if (!isAborted) {
      const errorMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: `*错误：${result.error || '生成失败'}*`,
        timestamp: Date.now(),
      }
      setMessages(prev => [...prev, errorMsg])
    }

    setStreamingText(null)
  }, [getDocContent])

  const handleSend = useCallback(async () => {
    const text = inputText.trim()
    if (!text || isStreaming) return

    const quoteText = activeSelectedText
      ? activeSelectedText.split('\n').map(
          l => `> ${l.length > 200 ? l.slice(0, 200) + '...' : l}`
        ).join('\n') + '\n\n'
      : ''
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: quoteText + text,
      timestamp: Date.now(),
    }

    const withSelected = activeSelectedText
    setMessages(prev => [...prev, userMsg])
    setInputText('')
    setActiveSelectedText(undefined)
    onSelectionUsed?.()

    await doSend([...messages, userMsg], text, withSelected)
  }, [inputText, isStreaming, messages, activeSelectedText, doSend, onSelectionUsed])

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort()
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleClear = () => {
    setMessages([])
    setStreamingText(null)
    setIsStreaming(false)
    storageService.deleteChatHistory(documentId)
  }

  // --- Edit & Delete ---
  const handleStartEdit = (msg: ChatMessage) => {
    setEditingMsgId(msg.id)
    setEditDraft(msg.content)
  }

  const handleCancelEdit = () => {
    setEditingMsgId(null)
    setEditDraft('')
  }

  const handleSaveEdit = async () => {
    if (!editingMsgId || !editDraft.trim()) return
    const idx = messages.findIndex(m => m.id === editingMsgId)
    if (idx === -1) return

    // Truncate from this message onward
    const truncated = messages.slice(0, idx)
    const editedMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: editDraft.trim(),
      timestamp: Date.now(),
    }
    const newMessages = [...truncated, editedMsg]
    setMessages(newMessages)
    setEditingMsgId(null)
    setEditDraft('')

    // Trigger AI regeneration
    await doSend(newMessages, editDraft.trim())
  }

  const handleDelete = (msgId: string) => {
    const idx = messages.findIndex(m => m.id === msgId)
    if (idx === -1) return
    setMessages(prev => prev.slice(0, idx))
  }

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSaveEdit()
    }
    if (e.key === 'Escape') {
      handleCancelEdit()
    }
  }

  // Auto-focus edit textarea
  useEffect(() => {
    if (editingMsgId && editTextareaRef.current) {
      editTextareaRef.current.focus()
      editTextareaRef.current.setSelectionRange(
        editTextareaRef.current.value.length,
        editTextareaRef.current.value.length,
      )
    }
  }, [editingMsgId])

  return (
    <div className="chat-panel">
      <div className="chat-panel-header">
        <h3>AI 问答</h3>
        <div className="chat-panel-header-actions">
          {messages.length > 0 && (
            <button className="chat-panel-action-btn" onClick={handleClear} title="清空聊天">
              <Trash2 size={14} />
            </button>
          )}
          <button className="chat-panel-action-btn" onClick={onClose} title="关闭">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="chat-panel-messages" ref={messagesRef}>
        {messages.length === 0 && !isStreaming && (
          <div className="chat-panel-empty">
            <p>向 AI 提问关于本文档的内容</p>
            <p className="chat-panel-empty-hint">{documentTitle}</p>
          </div>
        )}
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`chat-panel-msg ${msg.role === 'user' ? 'chat-panel-msg-user' : 'chat-panel-msg-assistant'} ${editingMsgId === msg.id ? 'chat-panel-msg-editing' : ''}`}
          >
            {msg.role === 'user' ? (
              editingMsgId === msg.id ? (
                <div className="chat-panel-msg-edit-wrap">
                  <textarea
                    ref={editTextareaRef}
                    className="chat-panel-textarea"
                    value={editDraft}
                    onChange={e => setEditDraft(e.target.value)}
                    onKeyDown={handleEditKeyDown}
                    rows={2}
                  />
                  <div className="chat-panel-msg-edit-actions">
                    <button className="chat-panel-msg-action-btn" onClick={handleCancelEdit} title="取消">
                      <X size={13} />
                    </button>
                    <button className="chat-panel-msg-action-btn chat-panel-msg-action-save" onClick={handleSaveEdit} title="保存并重新生成">
                      <Check size={13} />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="chat-panel-msg-md"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                />
              )
            ) : (
              <div
                className="chat-panel-msg-md"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
              />
            )}

            {/* Hover actions for user messages (not editing, not streaming) */}
            {msg.role === 'user' && editingMsgId !== msg.id && !isStreaming && (
              <div className="chat-panel-msg-actions">
                <button className="chat-panel-msg-action-btn" onClick={() => handleStartEdit(msg)} title="编辑">
                  <Pencil size={12} />
                </button>
                <button className="chat-panel-msg-action-btn" onClick={() => handleDelete(msg.id)} title="删除">
                  <Trash2 size={12} />
                </button>
              </div>
            )}
          </div>
        ))}
        {isStreaming && streamingText !== null && (
          <div className="chat-panel-msg chat-panel-msg-assistant">
            <div
              className="chat-panel-msg-md"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(streamingText) }}
            />
            <span className="ai-bubble-cursor" />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-panel-input-area">
        {/* Selected text reference card */}
        {activeSelectedText && (
          <div className="chat-panel-selected-ref">
            <div className="chat-panel-selected-ref-text">
              {activeSelectedText.length > 120
                ? activeSelectedText.slice(0, 120) + '...'
                : activeSelectedText}
            </div>
            <button
              className="chat-panel-selected-ref-close"
              onClick={() => setActiveSelectedText(undefined)}
            >
              <X size={12} />
            </button>
          </div>
        )}
        <div className="chat-panel-input-row">
          <textarea
            ref={textareaRef}
            className="chat-panel-textarea"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={activeSelectedText ? '针对选中文本提问...' : '输入问题...'}
            disabled={isStreaming}
            rows={1}
          />
          {isStreaming ? (
            <button className="chat-panel-send-btn chat-panel-stop-btn" onClick={handleStop} title="停止生成">
              <Square size={14} />
            </button>
          ) : (
            <button
              className="chat-panel-send-btn"
              onClick={handleSend}
              disabled={!inputText.trim()}
            >
              <Send size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
