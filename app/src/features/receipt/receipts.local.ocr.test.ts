// @vitest-environment node
/**
 * The local real-receipt set (M2.5 plan, P1–P3, P14), read with the real
 * OCR like the corpus and scored with P2's measure. The receipts carry
 * personal data, so they live only in the git-ignored `fixtures/local/`
 * folder on the user's machine; wherever it's empty or missing, as in CI,
 * this test is skipped. See app/README.md, "Local real-receipt fixtures".
 *
 * It prints numbers and case names only. The full report (with the rows
 * read at the right price) goes to the git-ignored `.ai-review/`. Held-out
 * cases are skipped unless `SETTLE_HELD_OUT=1` (`scripts/measure-node.mjs
 * --held-out`). The reader is PaddleOCR, or Tesseract with
 * `SETTLE_READER=tesseract` (`--reader tesseract`). HEIC cases have no
 * Node decoder and are scored by the
 * browser run only. The browser run (`scripts/measure-local.mjs`) is the
 * reference; this one is for fast iteration.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createBill } from '../split/billReducer.ts'
import {
  readRows,
  rowAccuracy,
  scoreFailedImport,
  scoreImage,
  type ReadRow,
  type ScoredImage,
} from './accuracy.ts'
import {
  readerFromEnv,
  setUpNodeImport,
  type NodeImport,
} from './importDeps.node.ts'
import { importReceipt } from './importReceipt.ts'
import {
  countedCases,
  distinctReceipts,
  loadLocalCases,
  repositoryRoot,
  selectCases,
} from './localFixtures.node.ts'
import {
  caseNumbers,
  checkSetNames,
  rightPriceRows,
  partNumbers,
  writeReport,
  type RightPriceRow,
} from './localReport.node.ts'

const LOCAL = path.resolve('src/features/receipt/fixtures/local')
const HELD_OUT = process.env.SETTLE_HELD_OUT === '1'
const READER = readerFromEnv()

const all = await loadLocalCases(LOCAL)
const { scored, skipped } = selectCases(all, { heldOut: HELD_OUT })
const heic = scored.filter((entry) => entry.imageType === 'heic')
const cases = scored.filter((entry) => entry.imageType !== 'heic')

describe.skipIf(all.length === 0)(
  'the local real receipts (M2.5, P2 in Node)',
  () => {
    let node: NodeImport
    const images: ScoredImage[] = []
    const rows: Record<string, RightPriceRow[]> = {}
    const read: Record<string, ReadRow[]> = {}

    beforeAll(async () => {
      node = await setUpNodeImport(READER)
      console.log(
        JSON.stringify({
          reader: READER,
          cases: all.length,
          distinctReceipts: distinctReceipts(countedCases(all)),
          extraCases: all.length - countedCases(all).length,
          scored: cases.length,
          heldOutSkipped: skipped.length,
          heicSkipped: heic.map((entry) => entry.name),
        }),
      )
    })

    afterAll(async () => {
      await node.dispose()
      if (images.length === 0) return
      const { totals, extra } = partNumbers(images, scored)
      console.log(JSON.stringify({ totals }))
      if (extra !== undefined) console.log(JSON.stringify({ extra }))
      const file = await writeReport(repositoryRoot(LOCAL), 'node', {
        when: new Date().toISOString(),
        reader: READER,
        heldOut: HELD_OUT,
        heldOutSkipped: skipped.map((entry) => entry.name),
        heicSkipped: heic.map((entry) => entry.name),
        totals,
        extra,
        cases: images.map((image) => ({
          name: image.name,
          receipt: image.receipt,
          ...image.score,
        })),
        rightPriceRows: rows,
        readRows: read,
        names: checkSetNames(scored),
      })
      console.log(`Report (local, git-ignored): ${file}`)
    })

    it('has no two different expected names the rule would pair', () => {
      const check = checkSetNames(scored)
      // Numbers only; the pairs themselves stay local.
      console.log(
        JSON.stringify({
          namePairsCompared: check.pairsCompared,
          collisions: check.collisions.length,
          identicalProducts: check.identical.length,
          truncatedNames: check.truncated.length,
        }),
      )
      expect(check.collisions).toEqual([])
    })

    it.each(cases)(
      '$name',
      async (entry) => {
        const bytes = await readFile(path.join(LOCAL, entry.image))
        let n = 0
        const result = await importReceipt(
          new File([bytes], entry.image, {
            type:
              entry.imageType === 'png'
                ? 'image/png'
                : entry.imageType === 'pdf'
                  ? 'application/pdf'
                  : 'image/jpeg',
          }),
          node.deps(),
          {
            currentBill: createBill(['p1', 'p2', 'old']),
            nextId: () => `i${++n}`,
          },
        )
        const score = result.ok
          ? scoreImage(result.bill, result.summary, entry.expected)
          : scoreFailedImport(entry.expected)
        images.push({ name: entry.name, receipt: entry.receipt, score })
        rows[entry.name] = result.ok ? rightPriceRows(result.bill, entry) : []
        read[entry.name] = result.ok ? readRows(result.bill) : []
        const listed = rows[entry.name] ?? []
        console.log(
          JSON.stringify({
            ...caseNumbers(entry, score),
            ...(!result.ok && { importError: result.error.code }),
            rightPriceRows: listed.length,
            rightPricePaired: listed.filter((row) => row.pairs).length,
          }),
        )

        if (entry.minRowAccuracy !== undefined) {
          expect(rowAccuracy(score), entry.name).toBeGreaterThanOrEqual(
            entry.minRowAccuracy,
          )
        }
      },
      180_000,
    )
  },
)

describe.runIf(all.length === 0)('the local real receipts', () => {
  it.skip('are absent here (as in CI): nothing to read', () => undefined)
})
