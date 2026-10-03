/**
 * The local real-receipt set, measured in Node (M2.5 plan, P2, P3): runs
 * `receipts.local.ocr.test.ts`, which prints P2's numbers per case and in
 * total and writes its full report under the git-ignored `.ai-review/`.
 * For fast iteration; the browser run (`measure-local.mjs`) is the
 * reference.
 *
 *   node scripts/measure-node.mjs [--held-out]
 *
 * `--held-out` also scores the held-out cases (P14): CP6's measurement
 * only. The reader is PaddleOCR.
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
let heldOut = false
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--held-out') heldOut = true
  else {
    console.error(`Unknown option ${args[i]}`)
    process.exit(2)
  }
}

const result = spawnSync(
  path.join(APP_DIR, 'node_modules', '.bin', 'vitest'),
  [
    'run',
    'src/features/receipt/receipts.local.ocr.test.ts',
    // The numbers are console output: shown for passing tests too.
    '--reporter=default',
    '--silent=false',
  ],
  {
    cwd: APP_DIR,
    stdio: 'inherit',
    env: {
      ...process.env,
      SETTLE_HELD_OUT: heldOut ? '1' : '0',
    },
  },
)
process.exit(result.status ?? 1)
