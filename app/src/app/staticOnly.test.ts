// @vitest-environment node
import { rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { ESLint } from 'eslint'
import { afterAll, describe, expect, it } from 'vitest'

// Static-only (M2 plan, D9, M-I-1, R5-O-1): the real ESLint config refuses
// network calls in production files under src/, and allows them in tests.
const probe = `export async function probe(): Promise<void> {
  await fetch('/vendor/x')
  navigator.sendBeacon('/vendor/x', 'y')
  new XMLHttpRequest()
  new WebSocket('ws://example.invalid')
  new EventSource('/vendor/x')
  await window.fetch('/vendor/x')
}
`
const production = path.resolve('src/app/staticOnlyProbe.ts')
const testFile = path.resolve('src/app/staticOnlyProbe.test.ts')

afterAll(async () => {
  await rm(production, { force: true })
  await rm(testFile, { force: true })
})

async function ruleIds(file: string): Promise<string[]> {
  await writeFile(file, probe)
  const [result] = await new ESLint().lintFiles([file])
  return (result?.messages ?? []).map((message) => message.ruleId ?? 'fatal')
}

describe('the static-only lint rule', () => {
  it('refuses fetch, sendBeacon, XMLHttpRequest, WebSocket and EventSource in production code', async () => {
    const ids = await ruleIds(production)
    expect(ids.filter((id) => id === 'no-restricted-globals')).toHaveLength(4)
    expect(ids.filter((id) => id === 'no-restricted-properties')).toHaveLength(
      2,
    )
    expect(ids).not.toContain('fatal')
  }, 60_000)

  it('allows them in a test file', async () => {
    const ids = await ruleIds(testFile)
    expect(ids).not.toContain('no-restricted-globals')
    expect(ids).not.toContain('no-restricted-properties')
    expect(ids).not.toContain('fatal')
  }, 60_000)
})
