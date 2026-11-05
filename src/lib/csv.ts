// A small CSV reader and writer (RFC 4180 quoting). No dependency (ADR-0051).

const BOM = /^﻿/

/** The separator a file uses: ";" when the header line has more of them than "," (outside quotes), else ",". */
export function detectDelimiter(text: string): ',' | ';' {
  let commas = 0
  let semicolons = 0
  let quoted = false
  for (const ch of text.replace(BOM, '')) {
    if (ch === '"') quoted = !quoted
    else if (!quoted && (ch === '\n' || ch === '\r')) break
    else if (!quoted && ch === ',') commas++
    else if (!quoted && ch === ';') semicolons++
  }
  return semicolons > commas ? ';' : ','
}

/**
 * Text → rows of fields. Quoted fields may hold the separator, line breaks and "" (a quote). CRLF, LF and CR end a row;
 * a leading UTF-8 BOM is dropped; rows that are completely empty (blank lines, the trailing newline) are skipped.
 * The separator (comma or semicolon) is read from the first line.
 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(BOM, '')
  const delimiter = detectDelimiter(src)
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  // A quoted field was seen in this row, so a row of empty "" values is not a blank line.
  let touched = false

  const endField = () => {
    row.push(field)
    field = ''
  }
  const endRow = () => {
    endField()
    if (touched || row.some((f) => f !== '')) rows.push(row)
    row = []
    touched = false
  }

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += ch
    } else if (ch === '"') {
      quoted = true
      touched = true
    } else if (ch === delimiter) {
      endField()
    } else if (ch === '\n') {
      endRow()
    } else if (ch === '\r') {
      if (src[i + 1] === '\n') i++
      endRow()
    } else field += ch
  }
  if (field !== '' || row.length > 0 || touched) endRow()
  return rows
}

const NEEDS_QUOTES = /[",;\r\n]|^\s|\s$/

/** Rows of fields → CSV text with comma separators and CRLF line ends (fields are quoted only when they must be). */
export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((r) => r.map((f) => (NEEDS_QUOTES.test(f) ? `"${f.replace(/"/g, '""')}"` : f)).join(',')).join('\r\n')
}
