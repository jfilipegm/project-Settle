import { useEffect, useRef, useState, type DragEvent } from 'react'
import type { Region } from '../../../app/region.ts'
import { useT } from '../../../i18n/language.ts'
import type { Translate } from '../../../i18n/t.ts'
import { newId } from '../../split/billReducer.ts'
import type { Bill } from '../../split/model.ts'
import splitStyles from '../../split/components/split.module.css'
import type { ImportResult } from '../importReceipt.ts'
import { billHasContent, revokeImageUrl } from '../importUi.ts'
import { readErrorMessage, readerSupportNote } from '../messages.ts'
import type { PhotoIssue, ReadErrorCode, ReadProgress } from '../model.ts'
import { useReceiptImport } from '../receiptImport.ts'
import { readerSupport, type ReaderSupport } from '../readerSupport.ts'
import { PhotoAdvice } from './PhotoAdvice.tsx'
import styles from './receipt.module.css'

/** The file types the picker offers (D7, D6): JPEG, PNG, HEIC/HEIF, PDF. */
export const RECEIPT_ACCEPT =
  'image/jpeg,image/png,image/heic,image/heif,.heic,.heif,application/pdf'

/** M2.5, P16: what the picker offers where the reader can't run. */
export const PDF_ACCEPT = 'application/pdf'

type Imported = Extract<ImportResult, { ok: true }>

interface Props {
  bill: Bill
  region: Region
  /** While a scan runs the editor is `inert` and `aria-busy` (D17). */
  onBusyChange: (busy: boolean) => void
  onImported: (imported: Imported) => void
  /**
   * Whether this browser can run the reader (M2.5, P16); the real check by
   * default. The tests pass each answer.
   */
  support?: () => ReaderSupport
}

function phaseText(
  t: Translate,
  { phase, progress }: ReadProgress,
  region: Region,
): string {
  switch (phase) {
    case 'opening':
      return t('receipt.scan.phase.opening')
    case 'loadingReader':
      return t('receipt.scan.phase.loadingReader')
    case 'reading':
      return progress === undefined
        ? t('receipt.scan.phase.reading')
        : t('receipt.scan.phase.readingProgress', {
            percent: new Intl.NumberFormat(region.locale, {
              style: 'percent',
            }).format(progress),
          })
    case 'checkingQr':
      return t('receipt.scan.phase.checkingQr')
  }
}

/**
 * "Scan a receipt" (M2 plan, CP4): choose a file, take a photo, or drop a
 * file on the section. The receipt is read on this device; while it's read
 * the status line shows the phase and Cancel stops it. Any failure shows
 * its message and leaves the bill as it was. The photo quality check's
 * advice (M2.5, P11) shows as soon as a page is checked, while the reading
 * goes on, so the user can cancel and take a better photo.
 *
 * M2.5, P16: in a browser that can't run the reader, photos aren't offered:
 * Choose file becomes Choose PDF (a text layer needs no reader) and a note
 * says why. A photo dropped anyway gets the reader's `readerUnsupported`.
 */
export function ScanReceipt({
  bill,
  region,
  onBusyChange,
  onImported,
  support = readerSupport,
}: Props) {
  const t = useT()
  const importReceipt = useReceiptImport()
  // Read once: it can't change while the page is open.
  const [supported] = useState(support)
  const [progress, setProgress] = useState<ReadProgress>()
  const [error, setError] = useState<ReadErrorCode>()
  const [photoIssues, setPhotoIssues] = useState<PhotoIssue[]>([])
  const [dragging, setDragging] = useState(false)
  const controller = useRef<AbortController>(undefined)
  const busy = progress !== undefined

  // Leaving the page stops a scan still running.
  useEffect(() => () => controller.current?.abort(), [])

  async function scan(file: File) {
    if (busy) {
      return
    }
    if (
      billHasContent(bill) &&
      !window.confirm(t('receipt.scan.replacePrompt'))
    ) {
      return
    }
    const current = new AbortController()
    controller.current = current
    setError(undefined)
    setPhotoIssues([])
    setProgress({ phase: 'opening' })
    onBusyChange(true)
    let result: ImportResult
    try {
      result = await importReceipt(file, {
        currentBill: bill,
        nextId: newId,
        regionCurrency: region.currency,
        notReadName: t('receipt.notReadItem'),
        signal: current.signal,
        onProgress: (next) => {
          if (!current.signal.aborted) setProgress(next)
        },
        onQuality: (issues) => {
          if (!current.signal.aborted) setPhotoIssues(issues)
        },
      })
    } catch {
      result = { ok: false, error: { code: 'ocrFailed' } }
    }
    if (controller.current === current) {
      controller.current = undefined
    }
    setProgress(undefined)
    // An import takes its advice to the check panel; a failed one drops it.
    setPhotoIssues([])
    onBusyChange(false)
    if (current.signal.aborted && result.ok) {
      // Cancelled at the last moment: nothing is imported.
      revokeImageUrl(result.imageUrl)
      result = { ok: false, error: { code: 'cancelled' } }
    }
    if (result.ok) {
      onImported(result)
    } else {
      setError(result.error.code)
    }
  }

  const pick = (input: HTMLInputElement) => {
    const file = input.files?.[0]
    // Cleared, so choosing the same file again still starts a scan.
    input.value = ''
    if (file !== undefined) {
      void scan(file)
    }
  }

  const hasFiles = (event: DragEvent) =>
    Array.from(event.dataTransfer.types).includes('Files')

  return (
    <section
      className={styles.scan}
      aria-labelledby="receipt-scan-heading"
      data-dragging={dragging}
      onDragEnter={(event) => {
        if (hasFiles(event) && !busy) {
          event.preventDefault()
          setDragging(true)
        }
      }}
      onDragOver={(event) => {
        if (hasFiles(event) && !busy) {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
        }
      }}
      onDragLeave={(event) => {
        const next = event.relatedTarget
        if (!(next instanceof Node && event.currentTarget.contains(next))) {
          setDragging(false)
        }
      }}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        const file = event.dataTransfer.files[0]
        if (file !== undefined) {
          void scan(file)
        }
      }}
    >
      <h2 id="receipt-scan-heading">{t('receipt.scan.heading')}</h2>
      {supported !== 'ok' && (
        <p className={styles.note} role="note">
          {readerSupportNote(t, supported)}
        </p>
      )}
      <p className={splitStyles.hint}>{t('receipt.scan.privacy')}</p>
      <div className={styles.scanActions}>
        <label className={styles.fileButton} data-disabled={busy}>
          <input
            type="file"
            className={splitStyles.srOnly}
            accept={supported === 'ok' ? RECEIPT_ACCEPT : PDF_ACCEPT}
            disabled={busy}
            onChange={(event) => {
              pick(event.currentTarget)
            }}
          />
          {supported === 'ok'
            ? t('receipt.scan.chooseFile')
            : t('receipt.scan.choosePdf')}
        </label>
        {supported === 'ok' && (
          <label className={styles.fileButton} data-disabled={busy}>
            <input
              type="file"
              className={splitStyles.srOnly}
              accept="image/*"
              capture="environment"
              disabled={busy}
              onChange={(event) => {
                pick(event.currentTarget)
              }}
            />
            {t('receipt.scan.takePhoto')}
          </label>
        )}
      </div>
      <p className={splitStyles.hint}>
        {supported === 'ok'
          ? t('receipt.scan.dropHint')
          : t('receipt.scan.dropPdfHint')}
      </p>

      <div className={styles.progress}>
        <p className={styles.status} role="status">
          {progress !== undefined && phaseText(t, progress, region)}
        </p>
        {busy && (
          <button
            type="button"
            className={splitStyles.secondaryButton}
            onClick={() => {
              controller.current?.abort()
            }}
          >
            {t('receipt.scan.cancel')}
          </button>
        )}
      </div>
      {busy && (
        <PhotoAdvice issues={photoIssues} lead={t('receipt.photo.lead')} />
      )}
      {error !== undefined && (
        <p className={styles.error} role="alert">
          {readErrorMessage(t, error)}
        </p>
      )}
    </section>
  )
}
