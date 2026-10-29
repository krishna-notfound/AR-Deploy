// The request photos for staff (S4 R-S4-11): a thumbnail grid and a viewer with previous/next (arrow keys), Esc to
// close (focus goes back to the thumbnail, Modal's focus trap), the file name and size, and "Download original".
// A photo that fails to load says so with Retry, never a broken image.
import { ChevronLeft, ChevronRight, Download, ImageOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/ToastProvider'
import type { ModelRequestPhoto } from '@/domain/modelRequests'
import { en } from '@/i18n/dictionaries/en'
import { useI18n } from '@/i18n/LanguageProvider'
import { downloadUrl } from '@/lib/download'
import { formatFileSize } from '@/lib/format'

export const PHOTO_FAILED = en['business.modelRequests.photo.failed']

/**
 * Load state of one photo; `retry` asks the page for fresh links (its refetch signs them again, so an expired
 * one-hour link recovers) and mounts the image again. Callers key the component by the photo's URL, so fresh links
 * start a fresh state.
 */
function usePhotoLoad(photo: ModelRequestPhoto, onReload?: () => void) {
  const [failed, setFailed] = useState(!photo.url)
  const [attempt, setAttempt] = useState(0)
  const retry = () => {
    onReload?.()
    setFailed(!photo.url)
    setAttempt((a) => a + 1)
  }
  return { failed, attempt, fail: () => setFailed(true), retry }
}

function PhotoFailed({ onRetry, compact }: { onRetry: () => void; compact?: boolean }) {
  const { t } = useI18n()
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center">
      <ImageOff className="size-5 text-ink-muted" aria-hidden />
      <p className={compact ? 'text-[12px] leading-4 text-ink-muted' : 'text-[14px] text-ink-muted'}>{t('business.modelRequests.photo.failed')}</p>
      <Button size="sm" onClick={onRetry}>
        {t('business.modelRequests.photo.retry')}
      </Button>
    </div>
  )
}

/** One thumbnail: a button that opens the viewer, or the failed state with Retry. */
export function PhotoThumb({ photo, index, onOpen, onReload }: { photo: ModelRequestPhoto; index: number; onOpen: () => void; onReload?: () => void }) {
  const { t } = useI18n()
  const load = usePhotoLoad(photo, onReload)
  return (
    <div className="aspect-square overflow-hidden rounded-[var(--radius-control)] border border-line bg-subtle">
      {load.failed ? (
        <PhotoFailed compact onRetry={load.retry} />
      ) : (
        <button type="button" onClick={onOpen} aria-label={t('business.modelRequests.photo.open', { n: index + 1, name: photo.fileName })} className="block size-full cursor-zoom-in focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
          <img key={load.attempt} src={photo.url} alt="" onError={load.fail} className="size-full object-cover" />
        </button>
      )}
    </div>
  )
}

export function PhotoViewer({ photos, index, onIndex, onClose, onReload }: { photos: ModelRequestPhoto[]; index: number; onIndex: (i: number) => void; onClose: () => void; onReload?: () => void }) {
  const { t } = useI18n()
  const toast = useToast()
  const [downloading, setDownloading] = useState(false)
  const photo = photos[index]
  const count = photos.length
  const prev = () => onIndex((index - 1 + count) % count)
  const next = () => onIndex((index + 1) % count)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && count > 1) {
        e.preventDefault()
        onIndex((index - 1 + count) % count)
      } else if (e.key === 'ArrowRight' && count > 1) {
        e.preventDefault()
        onIndex((index + 1) % count)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [index, count, onIndex])

  if (!photo) return null
  const download = async () => {
    if (!photo.url) return
    setDownloading(true)
    try {
      await downloadUrl(photo.url, photo.fileName)
    } catch {
      // The link may have expired: fetch fresh ones so the next try uses a newly signed link.
      onReload?.()
      toast.error(t('business.modelRequests.photo.downloadFailed'), t('business.modelRequests.photo.tryAgain'))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      closeLabel={t('business.modelRequests.photo.close')}
      title={t('business.modelRequests.photo.title', { n: index + 1, count })}
      description={
        <span className="flex flex-wrap gap-x-2">
          <span className="min-w-0 break-all">{photo.fileName}</span>
          <span className="tabular-nums">{formatFileSize(photo.sizeBytes)}</span>
        </span>
      }
      footer={
        <>
          {count > 1 && (
            <>
              <Button icon={<ChevronLeft className="size-4" aria-hidden />} onClick={prev}>
                {t('business.modelRequests.photo.previous')}
              </Button>
              <Button icon={<ChevronRight className="size-4" aria-hidden />} onClick={next}>
                {t('business.modelRequests.photo.next')}
              </Button>
            </>
          )}
          {photo.url && (
            <Button variant="primary" icon={<Download className="size-4" aria-hidden />} loading={downloading} onClick={() => void download()}>
              {t('business.modelRequests.photo.download')}
            </Button>
          )}
        </>
      }
    >
      <ViewerImage key={`${photo.storagePath}|${photo.url ?? ''}`} photo={photo} onReload={onReload} />
    </Modal>
  )
}

function ViewerImage({ photo, onReload }: { photo: ModelRequestPhoto; onReload?: () => void }) {
  const load = usePhotoLoad(photo, onReload)
  return (
    <div className="grid min-h-[240px] place-items-center overflow-hidden rounded-[var(--radius-control)] bg-subtle">
      {load.failed ? (
        <PhotoFailed onRetry={load.retry} />
      ) : (
        <img key={load.attempt} src={photo.url} alt={photo.fileName} onError={load.fail} className="max-h-[60vh] w-auto max-w-full object-contain" />
      )}
    </div>
  )
}
