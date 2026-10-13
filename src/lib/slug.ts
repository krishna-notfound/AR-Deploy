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

/** While typing: lowercase, invalid characters become '-', but a trailing '-' is kept so "modern-" can become "modern-sofa". Validated on save. */
export function slugInput(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-{2,}/g, '-')
}

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug)
}

/** Database check: product slugs are at most 70 characters. */
export const PRODUCT_SLUG_MAX = 70

/** Returns `base`, or `base-2`, `base-3`… until it is not in `taken`. The base is trimmed (never ending in '-') so the suffix fits in `maxLength`. */
export function uniqueSlug(base: string, taken: Iterable<string>, maxLength = Infinity): string {
  const set = new Set(taken)
  const root = base || 'item'
  const fit = (suffix: string) => root.slice(0, maxLength - suffix.length).replace(/-+$/, '') + suffix
  if (!set.has(fit(''))) return fit('')
  let n = 2
  while (set.has(fit(`-${n}`))) n++
  return fit(`-${n}`)
}
