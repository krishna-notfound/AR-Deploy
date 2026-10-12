export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
}

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug)
}

/** Returns `base`, or `base-2`, `base-3`… until it is not in `taken`. */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const set = new Set(taken)
  const root = base || 'item'
  if (!set.has(root)) return root
  let n = 2
  while (set.has(`${root}-${n}`)) n++
  return `${root}-${n}`
}
