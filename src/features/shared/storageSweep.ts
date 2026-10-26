import type { StorageSweep } from '@/services/catalogService'

/** Toast title after a delete: names the files storage could not remove, never claims a clean sweep it did not make. */
export function deletedToast(subject: 'Business' | 'Product', s: StorageSweep): string {
  if (s.failedFiles === 0) return `${subject} deleted`
  return `${subject} deleted, but ${s.failedFiles} file${s.failedFiles === 1 ? '' : 's'} could not be removed from storage.`
}
