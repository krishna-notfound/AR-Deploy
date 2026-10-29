// The Markdown toolbar of the page editor: pure edits of a text and its selection (no DOM), so each button is testable.
// Every function takes the text and the selection and returns the new text and the new selection.

export interface TextEdit {
  value: string
  start: number
  end: number
}

const splice = (value: string, from: number, to: number, insert: string) => value.slice(0, from) + insert + value.slice(to)

/** **bold**: wraps the selection; with no selection inserts the word `placeholder` already selected. */
export function bold(value: string, start: number, end: number, placeholder = 'bold'): TextEdit {
  const text = start === end ? placeholder : value.slice(start, end)
  const next = splice(value, start, end, `**${text}**`)
  return { value: next, start: start + 2, end: start + 2 + text.length }
}

/** Start of the line that contains `at`, and the end of the line that contains `to`. */
function lineSpan(value: string, at: number, to: number): [number, number] {
  const from = at === 0 ? 0 : value.lastIndexOf('\n', at - 1) + 1
  const nl = value.indexOf('\n', to)
  return [from, nl === -1 ? value.length : nl]
}

/** `## ` at the start of the line (or of every selected line); a line that already starts with `#` gets one more level, up to three. */
export function heading(value: string, start: number, end: number): TextEdit {
  const [from, to] = lineSpan(value, start, end)
  const lines = value.slice(from, to).split('\n')
  const out = lines.map((line) => {
    const m = /^(#{1,3})\s+/.exec(line)
    if (!m) return `## ${line}`
    return m[1]!.length >= 3 ? line.replace(/^#{1,3}\s+/, '') : `#${line}`
  })
  const text = out.join('\n')
  return { value: splice(value, from, to, text), start: from, end: from + text.length }
}

/** `- ` at the start of every selected line; lines that are already list items lose it again. */
export function list(value: string, start: number, end: number): TextEdit {
  const [from, to] = lineSpan(value, start, end)
  const lines = value.slice(from, to).split('\n')
  const allItems = lines.every((l) => /^-\s/.test(l))
  const text = lines.map((l) => (allItems ? l.replace(/^-\s/, '') : `- ${l}`)).join('\n')
  return { value: splice(value, from, to, text), start: from, end: from + text.length }
}

/** `[text](https://)`: the selection becomes the link text and the address is left selected for typing. */
export function link(value: string, start: number, end: number, placeholder = 'link text'): TextEdit {
  const text = start === end ? placeholder : value.slice(start, end)
  const url = 'https://'
  const next = splice(value, start, end, `[${text}](${url})`)
  const urlStart = start + text.length + 3
  return { value: next, start: urlStart, end: urlStart + url.length }
}
