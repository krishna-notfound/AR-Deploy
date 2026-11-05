import { describe, expect, it } from 'vitest'
import { detectDelimiter, parseCsv, toCsv } from './csv'

describe('parseCsv', () => {
  it('reads plain rows with LF and CRLF line ends', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([['a', 'b'], ['1', '2']])
    expect(parseCsv('a,b\r\n1,2\r\n3,4')).toEqual([['a', 'b'], ['1', '2'], ['3', '4']])
  })

  it('reads quoted fields: commas, doubled quotes and line breaks inside', () => {
    expect(parseCsv('name,note\n"Sofa, 3-seat","He said ""hi"""\n"two\nlines",x')).toEqual([
      ['name', 'note'],
      ['Sofa, 3-seat', 'He said "hi"'],
      ['two\nlines', 'x'],
    ])
  })

  it('reads a semicolon file (detected from the header line)', () => {
    expect(detectDelimiter('a;b;c\n1,5;2;3')).toBe(';')
    expect(parseCsv('nome;preço\nSofá;1299,50')).toEqual([['nome', 'preço'], ['Sofá', '1299,50']])
  })

  it('does not count separators inside quotes when detecting', () => {
    expect(detectDelimiter('"a;b;c",d\n')).toBe(',')
  })

  it('strips a UTF-8 BOM', () => {
    expect(parseCsv('﻿name,category\nA,sofa')[0]).toEqual(['name', 'category'])
  })

  it('skips blank lines but keeps empty fields', () => {
    expect(parseCsv('a,b,c\n\n1,,3\n\n')).toEqual([['a', 'b', 'c'], ['1', '', '3']])
  })

  it('keeps accents and a quoted empty value', () => {
    expect(parseCsv('a,b\n"",Cadeira de jantar ção')).toEqual([['a', 'b'], ['', 'Cadeira de jantar ção']])
  })

  it('returns no rows for empty text', () => {
    expect(parseCsv('')).toEqual([])
    expect(parseCsv('\n\n')).toEqual([])
  })
})

describe('toCsv', () => {
  it('quotes only what needs it and joins with CRLF', () => {
    expect(toCsv([['a', 'b;c'], ['x,y', 'say "hi"']])).toBe('a,"b;c"\r\n"x,y","say ""hi"""')
  })

  it('round-trips through parseCsv', () => {
    const rows = [['name', 'note'], ['Sofá, grande', 'linha\nnova'], ['a "b"', ' x ']]
    expect(parseCsv(toCsv(rows))).toEqual(rows)
  })
})
