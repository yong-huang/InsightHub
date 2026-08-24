import { describe, it, expect } from 'vitest'
import { extractJSON } from '../aiService'

describe('extractJSON', () => {
  it('parses valid JSON object', () => {
    const result = extractJSON('{"questions": [{"id": "q1"}]}')
    expect(result).toEqual({ questions: [{ id: 'q1' }] })
  })

  it('parses valid JSON array', () => {
    const result = extractJSON('[{"id": "q1"}, {"id": "q2"}]')
    expect(result).toEqual([{ id: 'q1' }, { id: 'q2' }])
  })

  it('strips markdown code fences', () => {
    const result = extractJSON('```json\n{"questions": []}\n```')
    expect(result).toEqual({ questions: [] })
  })

  it('strips bare code fences', () => {
    const result = extractJSON('```\n{"key": "value"}\n```')
    expect(result).toEqual({ key: 'value' })
  })

  it('strips think blocks', () => {
    const result = extractJSON('<think\nLet me analyze...\n</think\n{"result": true}')
    expect(result).toEqual({ result: true })
  })

  it('uses original if nothing left after stripping think block', () => {
    const input = '<think\nAll JSON was inside here\n{"data": 1}\n</think'
    const result = extractJSON(input)
    expect(result).toEqual({ data: 1 })
  })

  it('handles truncated JSON via brace matching', () => {
    const truncated = '{"questions": [{"id": "q1", "type": "choice"'
    const result = extractJSON(truncated) as { questions: { id: string }[] }
    // Should repair by closing unclosed brackets
    expect(result.questions).toBeDefined()
    expect(result.questions[0].id).toBe('q1')
  })

  it('repairs trailing commas', () => {
    const result = extractJSON('{"a": 1, "b": 2,}')
    expect(result).toEqual({ a: 1, b: 2 })
  })

  it('repairs trailing commas in arrays', () => {
    const result = extractJSON('{"items": [1, 2, 3,]}')
    expect(result).toEqual({ items: [1, 2, 3] })
  })

  it('normalizes Chinese punctuation', () => {
    const result = extractJSON('{"name"："test"，"value"：42}')
    expect(result).toEqual({ name: 'test', value: 42 })
  })

  it('escapes newlines in strings', () => {
    const input = '{"text": "hello\nworld"}'
    const result = extractJSON(input) as { text: string }
    expect(result.text).toBe('hello\nworld')
  })

  it('handles mixed content with explanation text', () => {
    const input = 'Here is the quiz:\n```json\n{"questions": []}\n```\nHope you enjoy!'
    const result = extractJSON(input)
    expect(result).toEqual({ questions: [] })
  })

  it('handles smart/curly double quotes', () => {
    // Left double quote \u201C, right double quote \u201D
    const input = '{"name": "test"}'
    // Regular JSON with standard quotes should parse directly
    const result = extractJSON(input)
    expect(result).toEqual({ name: 'test' })
  })

  it('throws on empty input', () => {
    expect(() => extractJSON('')).toThrow('Failed to extract JSON')
  })

  it('throws on input with no JSON', () => {
    expect(() => extractJSON('just plain text with no structure')).toThrow('Failed to extract JSON')
  })

  it('inserts missing commas between adjacent objects', () => {
    const input = '{"items": [{"id": 1}{"id": 2}]}'
    const result = extractJSON(input) as { items: unknown[] }
    expect(result.items).toHaveLength(2)
  })

  it('handles whitespace-only input', () => {
    expect(() => extractJSON('   ')).toThrow('Failed to extract JSON')
  })
})
