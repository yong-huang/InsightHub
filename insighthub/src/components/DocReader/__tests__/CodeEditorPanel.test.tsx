import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
import { CodeEditorPanel } from '../CodeEditorPanel'

// Mock AI services
const mockCallAIStream = vi.fn()
vi.mock('@/services/aiService', () => ({
  callAIStream: (...args: any[]) => mockCallAIStream(...args),
}))

const mockRecordUsage = vi.fn()
vi.mock('@/services/tokenUsageService', () => ({
  recordUsage: (...args: any[]) => mockRecordUsage(...args),
}))

// Mock document store
const mockEnsureContentText = vi.fn()
vi.mock('@/stores/documentStore', () => ({
  useDocumentStore: {
    getState: () => ({
      ensureContentText: (...args: any[]) => mockEnsureContentText(...args),
    }),
  },
}))

// Mock CodeMirror — forward onChange on input events so the component's handleCodeChange fires
vi.mock('@uiw/react-codemirror', () => ({
  default: (props: any) => (
    <div
      data-testid="codemirror"
      className="cm-content"
      contentEditable
      suppressContentEditableWarning
      onBlur={() => {}}
      onInput={() => props.onChange?.('new code from typing')}
    />
  ),
}))

// Mock fetch for runtimes
global.fetch = vi.fn()

describe('CodeEditorPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
    localStorage.clear()
    mockEnsureContentText.mockResolvedValue({ contentText: 'Reference code from document.' })
    ;(global.fetch as any).mockResolvedValue({ json: () => Promise.resolve([]) })
    mockCallAIStream.mockResolvedValue({
      success: true,
      data: 'AI response text',
      usage: { promptTokens: 50, completionTokens: 30, totalTokens: 80 },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls recordUsage with code-coach after coach hint streaming completes', async () => {
    const coachUsage = { promptTokens: 100, completionTokens: 50, totalTokens: 150 }
    mockCallAIStream.mockResolvedValue({
      success: true,
      data: 'Try using a for loop here.',
      usage: coachUsage,
    })

    render(<CodeEditorPanel docId="test-doc" onClose={vi.fn()} initialText="def hello():\n  pass" />)

    // Wait for mount
    await waitFor(() => {
      expect(screen.getByText('Code')).toBeInTheDocument()
    })

    // Open coach mode
    const coachBtn = screen.getByTitle('AI Coach')
    await act(async () => {
      coachBtn.click()
    })

    // Type into the CodeMirror editor → triggers onChange → handleCodeChange → 5s debounce
    const cm = screen.getByTestId('codemirror')
    await act(async () => {
      fireEvent.input(cm, { inputType: 'insertText' })
    })

    // Advance past the 5s debounce timer
    await act(async () => {
      vi.advanceTimersByTime(6000)
    })

    // Wait for the coach request to resolve and recordUsage to be called
    await waitFor(() => {
      expect(mockRecordUsage).toHaveBeenCalledWith('code-coach', coachUsage, 'test-doc')
    })
  })

  it('calls recordUsage with code-review after AI review completes', async () => {
    const reviewUsage = { promptTokens: 200, completionTokens: 100, totalTokens: 300 }
    const reviewedCode = '# REVIEW: Code looks good\ndef hello():\n  pass'
    mockCallAIStream.mockResolvedValue({
      success: true,
      data: reviewedCode,
      usage: reviewUsage,
    })

    render(<CodeEditorPanel docId="test-doc" onClose={vi.fn()} initialText="def hello():\n  pass" />)

    // Wait for mount
    await waitFor(() => {
      expect(screen.getByText('Code')).toBeInTheDocument()
    })

    // Click AI Review button
    const reviewBtn = screen.getByTitle('AI Review')
    await act(async () => {
      reviewBtn.click()
    })

    await waitFor(() => {
      expect(mockRecordUsage).toHaveBeenCalledWith('code-review', reviewUsage, 'test-doc')
    })
  })
})
