import { useEffect, useRef, useState, type DragEvent } from 'react'
import type { Region } from '../../../app/region.ts'
import { newId } from '../../split/billReducer.ts'
import type { Bill } from '../../split/model.ts'
import splitStyles from '../../split/components/split.module.css'
import type { ImportResult } from '../importReceipt.ts'
import { billHasContent, revokeImageUrl } from '../importUi.ts'
import { readErrorMessage } from '../messages.ts'
import type { ReadErrorCode, ReadProgress } from '../model.ts'
import { useReceiptImport } from '../receiptImport.ts'
import styles from './receipt.module.css'

/** The file types the picker offers (D7, D6): JPEG, PNG, HEIC/HEIF, PDF. */
export const RECEIPT_ACCEPT =
  'image/jpeg,image/png,image/heic,image/heif,.heic,.heif,application/pdf'

export const REPLACE_PROMPT =
  'Replace the current items with the receipt’s? People stay as they are.'

type Imported = Extract<ImportResult, { ok: true }>

interface Props {
  bill: Bill
  region: Region
  /** While a scan runs the editor is `inert` and `aria-busy` (D17). */
  onBusyChange: (busy: boolean) => void
  onImported: (imported: Imported) => void
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
 * its message and leaves the bill as it was.
 */
export function ScanReceipt({ bill, region, onBusyChange, onImported }: Props) {
  const importReceipt = useReceiptImport()
  const [progress, setProgress] = useState<ReadProgress>()
  const [error, setError] = useState<ReadErrorCode>()
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
      })
    } catch {
      result = { ok: false, error: { code: 'ocrFailed' } }
    }
    if (controller.current === current) {
      controller.current = undefined
    }
    setProgress(undefined)
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
      <p className={splitStyles.hint}>
        Read on this device. The receipt never leaves your browser.
      </p>
      <div className={styles.scanActions}>
        <label className={styles.fileButton} data-disabled={busy}>
          <input
            type="file"
            className={splitStyles.srOnly}
            accept={RECEIPT_ACCEPT}
            disabled={busy}
            onChange={(event) => {
              pick(event.currentTarget)
            }}
          />
          Choose file
        </label>
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
      </div>
      <p className={splitStyles.hint}>
        Or drop a JPEG, PNG, HEIC or PDF file here.
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
      {error !== undefined && (
        <p className={styles.error} role="alert">
          {readErrorMessage(error)}
        </p>
      )}
    </section>
  )
}
