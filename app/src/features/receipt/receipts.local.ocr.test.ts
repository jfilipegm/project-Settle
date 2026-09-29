// @vitest-environment node
/**
 * The user's real receipts (remediation plan, R17 and the acceptance
 * targets), read with the real OCR like the corpus. They carry personal
 * data, so they live only in the git-ignored `fixtures/local/` folder on
 * the user's machine; wherever it's empty or missing, as in CI, this test
 * is skipped. See app/README.md, "Local real-receipt fixtures".
 *
 * Each `<name>.png` has a `<name>.expected.json`: the QR total, the item
 * prices as printed, and its target (`minCoverage`, R19's local coverage;
 * `itemsAllRight`, every read item at its right price; `check`).
 */
import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cents, type Cents } from '../../lib/money.ts'
import { createBill } from '../split/billReducer.ts'
import { lineTotal } from '../split/model.ts'
import { setUpNodeImport, type NodeImport } from './importDeps.node.ts'
import { importReceipt } from './importReceipt.ts'
import { matchedCoverage } from './matchedCoverage.ts'
import { isNearTotal } from './toBill.ts'
import { checkReceipt } from './reconcile.ts'

interface LocalExpected {
  qrTotal: string
  items: string[]
  minCoverage?: number
  itemsAllRight?: boolean
  check?: 'match'
}

const LOCAL = path.resolve('src/features/receipt/fixtures/local')

const toCents = (decimal: string): Cents =>
  cents(Math.round(Number(decimal) * 100))

async function loadLocal() {
  if (!existsSync(LOCAL)) return []
  const names = (await readdir(LOCAL))
    .filter((name) => name.endsWith('.expected.json'))
    .map((name) => name.replace(/\.expected\.json$/, ''))
    .sort()
  return Promise.all(
    names.map(async (name) => ({
      name,
      expected: JSON.parse(
        await readFile(path.join(LOCAL, `${name}.expected.json`), 'utf8'),
      ) as LocalExpected,
    })),
  )
}

const receipts = await loadLocal()

describe.skipIf(receipts.length === 0)(
  'the local real receipts (R17, the acceptance targets)',
  () => {
    let node: NodeImport
    beforeAll(async () => {
      node = await setUpNodeImport()
    })
    afterAll(async () => {
      await node.dispose()
    })

    it.each(receipts)(
      '$name',
      async ({ name, expected }) => {
        const bytes = await readFile(path.join(LOCAL, `${name}.png`))
        let n = 0
        const result = await importReceipt(
          new File([bytes], `${name}.png`, { type: 'image/png' }),
          node.deps(),
          {
            currentBill: createBill(['p1', 'p2', 'old']),
            nextId: () => `i${++n}`,
          },
        )
        if (!result.ok) throw new Error(`${name}: ${result.error.code}`)
        const qrTotal = toCents(expected.qrTotal)
        const read = result.bill.items.map((item) => ({
          name: item.name,
          amount: lineTotal(item),
        }))
        const coverage = matchedCoverage(
          read,
          expected.items.map(toCents),
          qrTotal,
        )
        const itemsSum = read.reduce((acc, item) => acc + item.amount, 0)
        const inApp = Math.min(
          1,
          read
            .filter((item) => item.name !== 'Not read from the receipt')
            .reduce((acc, item) => acc + item.amount, 0) / qrTotal,
        )
        const check = checkReceipt(result.bill, result.summary).status
        const nearTotalLeft = read.filter((item) =>
          isNearTotal(item.amount, qrTotal),
        ).length
        // The checkpoint notes' measurements: numbers only, no content.
        console.log(
          JSON.stringify({
            receipt: name,
            items: read.length,
            itemsSum,
            localCoverage: Number(coverage.coverage.toFixed(3)),
            unmatchedSum: coverage.unmatchedSum,
            inAppCoverage: Number(inApp.toFixed(3)),
            check,
            totalSource: result.summary.totalSource,
            cutLines: result.summary.removedLines?.length ?? 0,
            itemsNearQrTotalLeft: nearTotalLeft,
            billDiscount: result.bill.discount,
          }),
        )

        expect(read.length, name).toBeGreaterThan(0)
        expect(result.summary.totalSource, name).toBe('qr')
        expect(result.summary.total, name).toBe(qrTotal)
        if (expected.minCoverage !== undefined) {
          expect(coverage.coverage, name).toBeGreaterThanOrEqual(
            expected.minCoverage,
          )
        }
        if (expected.itemsAllRight) {
          expect(coverage.unmatchedSum, name).toBe(0)
        }
        if (expected.check !== undefined) {
          expect(check, name).toBe(expected.check)
        }
      },
      120_000,
    )
  },
)

describe.runIf(receipts.length === 0)('the local real receipts', () => {
  it.skip('are absent here (as in CI): nothing to read', () => undefined)
})
