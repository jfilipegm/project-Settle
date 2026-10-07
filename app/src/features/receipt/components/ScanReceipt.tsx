import { useEffect, useRef, useState, type DragEvent } from 'react'
import type { Region } from '../../../app/region.ts'
import { newId } from '../../split/billReducer.ts'
import type { Bill } from '../../split/model.ts'
import splitStyles from '../../split/components/split.module.css'
import type { ImportResult } from '../importReceipt.ts'
import { billHasContent, revokeImageUrl } from '../importUi.ts'
import {
  PHOTO_ADVICE_LEAD,
  readErrorMessage,
  readerSupportNote,
} from '../messages.ts'
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

export const REPLACE_PROMPT =
  'Replace the current items with the receipt’s? People stay as they are.'

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

function phaseText({ phase, progress }: ReadProgress, region: Region): string {
  switch (phase) {
    case 'opening':
      return 'Opening the file…'
    case 'loadingReader':
      return 'Loading the reader (first time only)…'
    case 'reading':
      return progress === undefined
        ? 'Reading the text…'
        : `Reading the text… ${new Intl.NumberFormat(region.locale, {
            style: 'percent',
          }).format(progress)}`
    case 'checkingQr':
      return 'Checking the QR code…'
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
    if (billHasContent(bill) && !window.confirm(REPLACE_PROMPT)) {
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
      <h2 id="receipt-scan-heading">Scan a receipt</h2>
      {supported !== 'ok' && (
        <p className={styles.note} role="note">
          {readerSupportNote(supported)}
        </p>
      )}
      <p className={splitStyles.hint}>
        Read on this device. The receipt never leaves your browser.
      </p>
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
          {supported === 'ok' ? 'Choose file' : 'Choose PDF'}
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
            Take photo
          </label>
        )}
      </div>
      <p className={splitStyles.hint}>
        {supported === 'ok'
          ? 'Or drop a JPEG, PNG, HEIC or PDF file here.'
          : 'Or drop a PDF file here.'}
      </p>

      <div className={styles.progress}>
        <p className={styles.status} role="status">
          {progress !== undefined && phaseText(progress, region)}
        </p>
        {busy && (
          <button
            type="button"
            className={splitStyles.secondaryButton}
            onClick={() => {
              controller.current?.abort()
            }}
          >
            Cancel
          </button>
        )}
      </div>
      {busy && <PhotoAdvice issues={photoIssues} lead={PHOTO_ADVICE_LEAD} />}
      {error !== undefined && (
        <p className={styles.error} role="alert">
          {readErrorMessage(error)}
        </p>
      )}
    </section>
  )
}
