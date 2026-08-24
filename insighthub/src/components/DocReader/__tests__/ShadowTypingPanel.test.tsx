import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ShadowTypingPanel } from '../ShadowTypingPanel'

// Mock AI services
const mockCallAIStream = vi.fn()
vi.mock('@/services/aiService', () => ({
  callAIStream: (...args: unknown[]) => mockCallAIStream(...args),
}))

const mockRecordUsage = vi.fn()
vi.mock('@/services/tokenUsageService', () => ({
  recordUsage: (...args: unknown[]) => mockRecordUsage(...args),
}))

// Mock document store
const mockEnsureContentText = vi.fn()
vi.mock('@/stores/documentStore', () => ({
  useDocumentStore: {
    getState: () => ({
      ensureContentText: (...args: unknown[]) => mockEnsureContentText(...args),
    }),
  },
}))

// Helper: create a streaming mock that calls onChunk synchronously and resolves
function mockStreamResponse(text: string, usage = { promptTokens: 100, completionTokens: 50, totalTokens: 150 }) {
  return async (_messages: unknown[], onChunk: (t: string) => void, _signal?: AbortSignal) => {
    onChunk(text)
    return { success: true, data: text, usage }
  }
}

describe('ShadowTypingPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockEnsureContentText.mockResolvedValue({ contentText: 'Sample document text for testing.' })
    mockCallAIStream.mockImplementation(mockStreamResponse('Hello! Welcome to the exercise.'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders title "Shadow Typing"', async () => {
    render(<ShadowTypingPanel docId="test-doc" onClose={vi.fn()} />)
    expect(screen.getByText('Shadow Typing')).toBeInTheDocument()
  })

  it('shows loading state initially', () => {
    render(<ShadowTypingPanel docId="test-doc" onClose={vi.fn()} />)
    expect(screen.getByText('Reading document...')).toBeInTheDocument()
  })

  it('displays AI messages after streaming completes', async () => {
    render(<ShadowTypingPanel docId="test-doc" onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('Hello! Welcome to the exercise.')).toBeInTheDocument()
    })
  })

  it('displays ref links with truncation for long refs', async () => {
    const longRef = 'Sample document text for testing and more content here to exceed thirty chars'
    mockEnsureContentText.mockResolvedValue({ contentText: 'Sample document text for testing.' })
    mockCallAIStream.mockImplementation(
      mockStreamResponse(`Some text [ref:${longRef}]`)
    )
    render(<ShadowTypingPanel docId="test-doc" onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText(longRef.slice(0, 30) + '...')).toBeInTheDocument()
    })
  })

  it('has textarea with placeholder', async () => {
    render(<ShadowTypingPanel docId="test-doc" onClose={vi.fn()} />)
    const textarea = await screen.findByPlaceholderText('Type your answer...')
    expect(textarea).toBeInTheDocument()
  })

  it('disables send button when input is empty', async () => {
    render(<ShadowTypingPanel docId="test-doc" onClose={vi.fn()} />)
    const sendBtn = await screen.findByTitle('Send (Cmd+Enter)')
    expect(sendBtn).toBeDisabled()
  })

  it('enables send button when input has text', async () => {
    render(<ShadowTypingPanel docId="test-doc" onClose={vi.fn()} />)
    // Wait for streaming to complete first
    await waitFor(() => {
      expect(screen.queryByText('Reading document...')).not.toBeInTheDocument()
    })
    const textarea = screen.getByPlaceholderText('Type your answer...')
    await userEvent.type(textarea, 'Hello')
    const sendBtn = screen.getByTitle('Send (Cmd+Enter)')
    expect(sendBtn).not.toBeDisabled()
  })

  it('calls onClose when close button clicked', async () => {
    const onClose = vi.fn()
    render(<ShadowTypingPanel docId="test-doc" onClose={onClose} />)
    // Close button has class code-editor-close-btn
    const closeBtn = document.querySelector('.code-editor-close-btn')!
    await act(async () => {
      closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('toggles translucent on click', async () => {
    render(<ShadowTypingPanel docId="test-doc" onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('Shadow Typing')).toBeInTheDocument()
    })
    const translucentBtn = screen.getByTitle('Opaque')
    await act(async () => {
      translucentBtn.click()
    })
    // After click, button title should change to 'Translucent'
    expect(screen.getByTitle('Translucent')).toBeInTheDocument()
  })

  it('restores saved history from localStorage', async () => {
    const savedMessages = [
      { role: 'ai' as const, content: 'Saved message 1' },
      { role: 'user' as const, content: 'My response' },
    ]
    const key = 'insighthub:shadow-history'
    localStorage.setItem(key, JSON.stringify({ 'test-doc': savedMessages }))

    render(<ShadowTypingPanel docId="test-doc" onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('Saved message 1')).toBeInTheDocument()
    })
    expect(screen.getByText('My response')).toBeInTheDocument()
  })

  it('submits user message and triggers AI on send', async () => {
    let onChunkRef: ((t: string) => void) | undefined
    let streamResolve: (v: unknown) => void
    let callCount = 0
    mockCallAIStream.mockImplementation(async (...args: unknown[]) => {
      callCount++
      const onChunk = args[1] as ((t: string) => void) | undefined
      if (callCount === 1) {
        // First call (initial session) — resolve immediately
        onChunk?.('Initial AI message')
        return { success: true, data: 'Initial AI message', usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } }
      }
      // Second call (user submission) — capture onChunk, hang until resolved
      onChunkRef = onChunk
      return await new Promise(r => { streamResolve = r })
    })

    render(<ShadowTypingPanel docId="test-doc" onClose={vi.fn()} />)

    // Wait for initial streaming to finish
    await waitFor(() => {
      expect(screen.getByText('Initial AI message')).toBeInTheDocument()
    })

    const textarea = screen.getByPlaceholderText('Type your answer...')
    await userEvent.type(textarea, 'My answer')
    await userEvent.click(screen.getByTitle('Send (Cmd+Enter)'))

    await waitFor(() => {
      expect(screen.getByText('My answer')).toBeInTheDocument()
    })

    // Resolve the stream — call onChunk first so streamingContent is set
    await act(async () => {
      onChunkRef?.('AI response')
      streamResolve!({ success: true, data: 'AI response', usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } })
    })

    await waitFor(() => {
      expect(screen.getByText('AI response')).toBeInTheDocument()
    })
  })

  it('submits with Cmd+Enter', async () => {
    let callCount = 0
    mockCallAIStream.mockImplementation(async (...args: unknown[]) => {
      callCount++
      if (callCount === 1) {
        const onChunk = args[1] as ((t: string) => void) | undefined
        onChunk?.('Initial AI message')
        return { success: true, data: 'Initial AI message', usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } }
      }
      const onChunk = args[1] as ((t: string) => void) | undefined
      onChunk?.('AI response')
      return { success: true, data: 'AI response', usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } }
    })

    render(<ShadowTypingPanel docId="test-doc" onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Initial AI message')).toBeInTheDocument()
    })

    const textarea = screen.getByPlaceholderText('Type your answer...')
    await userEvent.type(textarea, 'My answer')
    await userEvent.keyboard('{Meta>}{Enter}{/Meta}')

    await waitFor(() => {
      expect(screen.getByText('My answer')).toBeInTheDocument()
    })
  })

  it('calls recordUsage after streaming completes', async () => {
    const usage = { promptTokens: 200, completionTokens: 100, totalTokens: 300 }
    mockCallAIStream.mockImplementation(mockStreamResponse('Response text', usage))

    render(<ShadowTypingPanel docId="test-doc" onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('Response text')).toBeInTheDocument()
    })

    expect(mockRecordUsage).toHaveBeenCalledWith('shadow-typing', usage)
  })

  it('parses refs from AI response', async () => {
    mockEnsureContentText.mockResolvedValue({ contentText: 'meeting agenda minutes' })
    mockCallAIStream.mockImplementation(
      mockStreamResponse('Try this exercise. [ref:meeting agenda, minutes]')
    )

    render(<ShadowTypingPanel docId="test-doc" onClose={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText('Try this exercise.')).toBeInTheDocument()
    })
    // Ref links should be rendered
    expect(screen.getByTitle('Jump to: meeting agenda')).toBeInTheDocument()
    expect(screen.getByTitle('Jump to: minutes')).toBeInTheDocument()
  })

  it('restarts clears history and starts fresh', async () => {
    // Save some history first
    const key = 'insighthub:shadow-history'
    const savedMessages = [{ role: 'ai' as const, content: 'Old message' }]
    localStorage.setItem(key, JSON.stringify({ 'test-doc': savedMessages }))

    mockCallAIStream.mockImplementation(
      mockStreamResponse('Fresh start!')
    )

    render(<ShadowTypingPanel docId="test-doc" onClose={vi.fn()} />)

    // Wait for old history to load
    await waitFor(() => {
      expect(screen.getByText('Old message')).toBeInTheDocument()
    })

    // Click restart button
    const restartBtn = screen.getByTitle('Restart Session')
    await userEvent.click(restartBtn)

    // Should clear history and show fresh response
    await waitFor(() => {
      expect(screen.getByText('Fresh start!')).toBeInTheDocument()
    })
  })

  it('disables restart button during streaming', async () => {
    let streamResolve: (v: unknown) => void
    mockCallAIStream.mockImplementation(async (..._args: unknown[]) => {
      // Hang until resolved — keeps isStreaming true
      return await new Promise(r => { streamResolve = r })
    })

    render(<ShadowTypingPanel docId="test-doc" onClose={vi.fn()} />)

    // During initial load, streaming should be happening
    await waitFor(() => {
      expect(mockCallAIStream).toHaveBeenCalled()
    })

    const restartBtn = screen.getByTitle('Restart Session')
    expect(restartBtn).toBeDisabled()

    // Resolve to allow cleanup
    await act(async () => {
      streamResolve!({ success: true, data: 'Done', usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } })
    })
  })
})
