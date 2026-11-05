import { describe, expect, it } from 'vitest'
import { parseCsv } from '@/lib/csv'
import { IMPORT_COLUMNS, MAX_IMPORT_ROWS, prepareImport, rowsFromCsv, templateCsv } from './importRows'

const HEADER = 'name_en,name_pt,category,price,currency,width,height,depth,unit'

describe('rowsFromCsv', () => {
  it('reads a good file', () => {
    const r = rowsFromCsv(`${HEADER}\nOslo sofa,Sofá Oslo,sofa,1299.50,EUR,210,85,95,cm\nPine chair,,chair,89,,45,90,50,`)
    expect(r.fileProblem).toBeUndefined()
    expect(r.problems).toEqual([])
    expect(r.rows).toHaveLength(2)
    expect(r.rows[0]).toEqual({
      name: { en: 'Oslo sofa', pt: 'Sofá Oslo' },
      category: 'sofa',
      price: 129950,
      currency: 'EUR',
      dimensions: { width: 210, height: 85, depth: 95, unit: 'cm' },
    })
    expect(r.rows[1]!.price).toBe(8900)
    expect(r.rows[1]!.currency).toBeUndefined()
    expect(r.rows[1]!.dimensions?.unit).toBe('cm')
  })

  it('matches header names without case and ignores unknown columns', () => {
    const r = rowsFromCsv('Name_EN, Category ,colour\nLamp,Lighting,red')
    expect(r.problems).toEqual([])
    expect(r.rows[0]).toEqual({ name: { en: 'Lamp' }, category: 'lighting' })
  })

  it('reports a missing name and a missing category', () => {
    const r = rowsFromCsv('name_en,category\n,sofa\nTable,')
    expect(r.rows).toHaveLength(2)
    expect(r.problems.map((p) => [p.index, p.errors.map((e) => e.key)])).toEqual([
      [0, ['common.validation.product.nameRequired']],
      [1, ['products.import.problem.categoryRequired']],
    ])
  })

  it('reports a category that is not in the list, and accepts the English plural', () => {
    const r = rowsFromCsv('name_en,category\nA,spaceship\nB,Sofas')
    expect(r.problems).toHaveLength(1)
    expect(r.problems[0]!.errors[0]).toMatchObject({ key: 'products.import.problem.categoryUnknown', vars: { value: 'spaceship' } })
    expect(r.rows[1]!.category).toBe('sofa')
  })

  it('reads a semicolon file with comma decimals and Portuguese accents', () => {
    const r = rowsFromCsv('name_en;name_pt;category;price;width\nArmchair;Poltrona de leitura, cinzenta;chair;1299,90;62,5')
    expect(r.problems).toEqual([])
    expect(r.rows[0]).toMatchObject({ name: { en: 'Armchair', pt: 'Poltrona de leitura, cinzenta' }, price: 129990, dimensions: { width: 62.5, unit: 'cm' } })
  })

  it('keeps commas, quotes and line breaks inside quoted fields', () => {
    const r = rowsFromCsv('name_en,category,description_en,description_pt\n"Sofa, large",sofa,"Says ""comfy""\nand deep","Descrição: ação, não"')
    expect(r.rows[0]).toMatchObject({
      name: { en: 'Sofa, large' },
      description: { en: 'Says "comfy"\nand deep', pt: 'Descrição: ação, não' },
    })
  })

  it('reports numbers, currency and unit it cannot read', () => {
    const r = rowsFromCsv('name_en,category,price,currency,width,unit\nA,sofa,abc,GBP,wide,yards')
    expect(r.problems[0]!.errors.map((e) => e.key)).toEqual([
      'products.form.priceFormat',
      'products.import.problem.currencyUnknown',
      'products.import.problem.unitUnknown',
      'products.import.problem.numberInvalid',
    ])
  })

  it('takes the call-to-action columns, and the unit default for dimensions', () => {
    const r = rowsFromCsv('name_en,category,depth,cta_label_en,cta_url\nA,bed,200,Ask us,https://x.test', { unit: 'in' })
    expect(r.rows[0]).toMatchObject({ dimensions: { depth: 200, unit: 'in' }, cta: { label: 'Ask us', url: 'https://x.test' } })
  })

  it('skips blank lines and strips a BOM', () => {
    const r = rowsFromCsv('﻿name_en,category\n\nA,sofa\n,,\n')
    expect(r.rows).toHaveLength(1)
  })

  it('refuses a file without a required column, without rows, or with too many rows', () => {
    expect(rowsFromCsv('title,category\nA,sofa').fileProblem).toMatchObject({ key: 'products.import.file.missingColumns', vars: { columns: 'name_en' } })
    expect(rowsFromCsv('name_en,category\n').fileProblem?.key).toBe('products.import.file.noRows')
    expect(rowsFromCsv('').fileProblem?.key).toBe('products.import.file.noRows')
    const many = `name_en,category\n${Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `P${i},sofa`).join('\n')}`
    const r = rowsFromCsv(many)
    expect(r.fileProblem).toMatchObject({ key: 'products.import.file.tooMany', vars: { n: MAX_IMPORT_ROWS + 1, max: MAX_IMPORT_ROWS } })
    expect(r.rows).toEqual([])
    expect(rowsFromCsv(`name_en,category\n${Array.from({ length: MAX_IMPORT_ROWS }, (_, i) => `P${i},sofa`).join('\n')}`).rows).toHaveLength(MAX_IMPORT_ROWS)
  })
})

describe('templateCsv', () => {
  it('has every column and one example row that imports cleanly', () => {
    const table = parseCsv(templateCsv())
    expect(table).toHaveLength(2)
    expect(table[0]).toEqual([...IMPORT_COLUMNS])
    const r = rowsFromCsv(templateCsv())
    expect(r.problems).toEqual([])
    const [p] = prepareImport(r.rows, r.problems, { businessId: 'b1', defaultCurrency: 'EUR', existingSlugs: [] })
    expect(p!.errors).toEqual([])
  })
})

describe('prepareImport', () => {
  const ctx = { businessId: 'b1', defaultCurrency: 'BRL' as const, existingSlugs: ['oslo-sofa'] }

  it('builds draft inputs: default currency, editor defaults, no photos or models', () => {
    const { rows, problems } = rowsFromCsv('name_en,category,price\nPine chair,chair,89')
    const [p] = prepareImport(rows, problems, ctx)
    expect(p!.errors).toEqual([])
    expect(p!.input).toMatchObject({
      businessId: 'b1',
      slug: 'pine-chair',
      category: 'chair',
      price: 8900,
      currency: 'BRL',
      images: [],
      models: {},
      dimensions: { width: 0, height: 0, depth: 0, unit: 'cm' },
      cta: { label: { en: 'Contact seller', pt: 'Contactar vendedor' } },
    })
  })

  it('makes slugs unique against the business and inside the file', () => {
    const { rows, problems } = rowsFromCsv('name_en,category\nOslo sofa,sofa\nOslo sofa,sofa\nCadeira Pinho,chair')
    expect(prepareImport(rows, problems, ctx).map((p) => p.input.slug)).toEqual(['oslo-sofa-2', 'oslo-sofa-3', 'cadeira-pinho'])
  })

  it('applies the editor draft rules: negative size, bad link', () => {
    const { rows, problems } = rowsFromCsv('name_en,category,width,cta_url\nA,sofa,-5,not a link')
    const [p] = prepareImport(rows, problems, ctx)
    expect(p!.errors.map((e) => e.key)).toEqual(['common.validation.numberPositive', 'common.validation.urlInvalid'])
  })

  it('does not repeat a message the reader already gave', () => {
    const { rows, problems } = rowsFromCsv('name_en,category\n,sofa')
    const [p] = prepareImport(rows, problems, ctx)
    expect(p!.errors.filter((e) => e.key === 'common.validation.product.nameRequired')).toHaveLength(1)
  })

  it('keeps a row with an unknown category as having errors', () => {
    const { rows, problems } = rowsFromCsv('name_en,category\nA,spaceship')
    expect(prepareImport(rows, problems, ctx)[0]!.errors).toHaveLength(1)
  })
})
