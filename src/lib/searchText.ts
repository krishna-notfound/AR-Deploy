/** Lower case with accents removed: "Web Móveis" becomes "web moveis", so a search typed without accents still finds it. */
export function searchKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/** True when the trimmed `term` is empty, or appears (ignoring case and accents) in any of the fields. */
export function matchesSearch(fields: string | readonly (string | null | undefined)[], term: string): boolean {
  const needle = searchKey(term.trim())
  if (!needle) return true
  const list = typeof fields === 'string' ? [fields] : fields
  return list.some((f) => !!f && searchKey(f).includes(needle))
}
