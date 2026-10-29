import { describe, expect, it } from 'vitest'
import { bold, heading, link, list } from './markdownInsert'

describe('markdown toolbar edits', () => {
  it('bold wraps the selection, or inserts a selected placeholder at the cursor', () => {
    expect(bold('say hello now', 4, 9)).toEqual({ value: 'say **hello** now', start: 6, end: 11 })
    const empty = bold('ab', 1, 1)
    expect(empty.value).toBe('a**bold**b')
    expect(empty.value.slice(empty.start, empty.end)).toBe('bold')
  })

  it('heading puts ## on the line of the cursor, adds a level to an existing one and removes it after ###', () => {
    expect(heading('one\ntwo', 5, 5).value).toBe('one\n## two')
    expect(heading('## two', 0, 0).value).toBe('### two')
    expect(heading('### two', 0, 0).value).toBe('two')
  })

  it('list prefixes every selected line and toggles back', () => {
    const e = list('a\nb\nc', 2, 5)
    expect(e.value).toBe('a\n- b\n- c')
    expect(list(e.value, 2, e.value.length).value).toBe('a\nb\nc')
  })

  it('link wraps the selection as the text and selects the address', () => {
    const e = link('see docs here', 4, 8)
    expect(e.value).toBe('see [docs](https://) here')
    expect(e.value.slice(e.start, e.end)).toBe('https://')
    expect(link('x', 0, 0).value).toBe('[link text](https://)x')
  })
})
