/**
 * "Scan a receipt" in a browser that can't run the reader (M2.5 plan, P16,
 * CP6A), each support answer passed through the `support` prop.
 */
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_REGION } from '../../../app/region.ts'
import { createBill } from '../../split/billReducer.ts'
import { readerSupportNote } from '../messages.ts'
import { ReceiptImportContext, type ImportReceiptFn } from '../receiptImport.ts'
import type { ReaderSupport } from '../readerSupport.ts'
import { PDF_ACCEPT, RECEIPT_ACCEPT, ScanReceipt } from './ScanReceipt.tsx'

afterEach(() => {
  vi.restoreAllMocks()
})

function renderScan(support: ReaderSupport) {
  const importReceipt = vi.fn<ImportReceiptFn>(
    () => new Promise(() => undefined),
  )
  render(
    <ReceiptImportContext value={importReceipt}>
      <ScanReceipt
        bill={createBill(['p1', 'p2', 'i1'])}
        region={DEFAULT_REGION}
        onBusyChange={() => undefined}
        onImported={() => undefined}
        support={() => support}
      />
    </ReceiptImportContext>,
  )
  const section = screen.getByRole('region', { name: 'Scan a receipt' })
  return { importReceipt, section }
}

describe('ScanReceipt and the reader support check (P16)', () => {
  it('offers Choose file and Take photo where the reader runs, with no note', () => {
    const { section } = renderScan('ok')
    expect(within(section).getByLabelText('Choose file')).toHaveAttribute(
      'accept',
      RECEIPT_ACCEPT,
    )
    expect(within(section).getByLabelText('Take photo')).toBeInTheDocument()
    expect(section).toHaveTextContent(
      'Or drop a JPEG, PNG, HEIC or PDF file here.',
    )
    expect(within(section).queryByRole('note')).not.toBeInTheDocument()
  })

  it.each(['noWebAssembly', 'noSimd'] as const)(
    'with %s, offers Choose PDF only, and a note saying why',
    (support) => {
      const { section } = renderScan(support)
      const inputs = section.querySelectorAll('input[type="file"]')
      expect(inputs).toHaveLength(1)
      expect(within(section).getByLabelText('Choose PDF')).toHaveAttribute(
        'accept',
        PDF_ACCEPT,
      )
      expect(within(section).queryByLabelText('Take photo')).toBeNull()
      expect(within(section).queryByLabelText('Choose file')).toBeNull()
      expect(section).toHaveTextContent('Or drop a PDF file here.')
      expect(within(section).getByRole('note')).toHaveTextContent(
        readerSupportNote(support),
      )
    },
  )

  it('names Lockdown Mode, and both ways to turn it off, only for noWebAssembly', () => {
    expect(readerSupportNote('noWebAssembly')).toContain('Lockdown Mode')
    expect(readerSupportNote('noWebAssembly')).toContain(
      'tap aA, then Website Settings',
    )
    expect(readerSupportNote('noWebAssembly')).toContain(
      'Settings for This Website',
    )
    expect(readerSupportNote('noSimd')).not.toContain('Lockdown Mode')
    expect(readerSupportNote('noSimd')).toContain('update iOS')
    for (const support of ['noWebAssembly', 'noSimd'] as const) {
      expect(readerSupportNote(support)).toContain(
        'A PDF receipt from an app still works.',
      )
    }
  })

  it('still imports a chosen PDF', () => {
    const { importReceipt, section } = renderScan('noWebAssembly')
    const pdf = new File(['%PDF'], 'receipt.pdf', { type: 'application/pdf' })
    fireEvent.change(within(section).getByLabelText('Choose PDF'), {
      target: { files: [pdf] },
    })
    expect(importReceipt).toHaveBeenCalledTimes(1)
    expect(importReceipt.mock.calls[0]?.[0]).toBe(pdf)
  })

  it('checks support once, not on every render', () => {
    const support = vi.fn<() => ReaderSupport>(() => 'ok')
    const { rerender } = render(
      <ReceiptImportContext value={vi.fn<ImportReceiptFn>()}>
        <ScanReceipt
          bill={createBill(['p1', 'p2', 'i1'])}
          region={DEFAULT_REGION}
          onBusyChange={() => undefined}
          onImported={() => undefined}
          support={support}
        />
      </ReceiptImportContext>,
    )
    rerender(
      <ReceiptImportContext value={vi.fn<ImportReceiptFn>()}>
        <ScanReceipt
          bill={createBill(['p1', 'p2', 'i1'])}
          region={DEFAULT_REGION}
          onBusyChange={() => undefined}
          onImported={() => undefined}
          support={support}
        />
      </ReceiptImportContext>,
    )
    expect(support).toHaveBeenCalledTimes(1)
  })
})
