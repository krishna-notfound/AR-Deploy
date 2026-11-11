// ADR-0063 (migration B): a Website Editor picture keeps its untouched original (originalPath) in the site-content bucket. That is only
// safe while nothing deletes files of that bucket. This guards it: if a clean-up is ever added, it must count originalPath as in use
// (and this test must be changed with it).
// @vitest-environment node
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '..', '..', '..')
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return n === 'node_modules' ? [] : files(p)
    return /\.(ts|tsx)$/.test(n) && !/\.test\./.test(n) ? [p] : []
  })

describe('site-content files are never deleted', () => {
  it('no source file that names the site-content bucket removes files from storage', () => {
    const offenders = [...files(join(root, 'src')), ...files(join(root, 'supabase', 'functions'))].filter((f) => {
      const text = readFileSync(f, 'utf8')
      const namesBucket = /site-content|SITE_ASSET_BUCKET/.test(text)
      return namesBucket && /\.storage\s*\.from\([^)]*\)\s*\.remove\(|\.remove\(\s*\[/.test(text)
    })
    expect(offenders.map((f) => f.replace(root, ''))).toEqual([])
  })

  it('the Supabase content service only uploads', () => {
    const text = readFileSync(join(root, 'src', 'services', 'supabase', 'supabaseContent.ts'), 'utf8')
    expect(text).toMatch(/\.upload\(/)
    expect(text).not.toMatch(/\.remove\(/)
  })
})
