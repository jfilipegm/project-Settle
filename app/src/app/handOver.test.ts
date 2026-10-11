import { afterEach, describe, expect, it, vi } from 'vitest'
import { download, handOver, type HandOverEnvironment } from './handOver.ts'

function environment(nav: HandOverEnvironment['navigator']) {
  const created: Blob[] = []
  const env: HandOverEnvironment = {
    navigator: nav,
    document,
    url: {
      createObjectURL: (blob: Blob) => {
        created.push(blob)
        return 'blob:test'
      },
      revokeObjectURL: vi.fn(),
    },
  }
  return { env, created }
}

const file = () =>
  new File(['{}'], 'Settle - Flat - 2026-10-11.json', {
    type: 'application/json',
  })

afterEach(() => {
  vi.restoreAllMocks()
})

describe('handing a file over (M6 plan, E7)', () => {
  it('shares the file where the browser can share files', async () => {
    const share = vi.fn(() => Promise.resolve())
    const { env, created } = environment({
      share,
      canShare: () => true,
    })
    expect(await handOver(file(), env)).toBe('shared')
    expect(share).toHaveBeenCalledWith({ files: [expect.any(File)] })
    expect(created).toEqual([])
  })

  it('downloads it where the browser can’t share files', async () => {
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)
    const { env, created } = environment({
      share: vi.fn(),
      canShare: () => false,
    })
    expect(await handOver(file(), env)).toBe('downloaded')
    expect(created).toHaveLength(1)
    const link = click.mock.contexts[0] as HTMLAnchorElement
    expect(link.download).toBe('Settle - Flat - 2026-10-11.json')
    expect(link.href).toBe('blob:test')
    expect(document.querySelector('a[download]')).toBeNull()
  })

  it('downloads it without Web Share at all (a LAN preview over http)', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
      () => undefined,
    )
    const { env, created } = environment(undefined)
    expect(await handOver(file(), env)).toBe('downloaded')
    expect(created).toHaveLength(1)
  })

  it('treats a cancelled share as nothing, not an error', async () => {
    const { env, created } = environment({
      share: () => Promise.reject(new DOMException('no', 'AbortError')),
      canShare: () => true,
    })
    expect(await handOver(file(), env)).toBe('cancelled')
    expect(created).toEqual([])
  })

  it('falls back to a download when sharing fails otherwise', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
      () => undefined,
    )
    const { env, created } = environment({
      share: () => Promise.reject(new DOMException('no', 'NotAllowedError')),
      canShare: () => true,
    })
    expect(await handOver(file(), env)).toBe('downloaded')
    expect(created).toHaveLength(1)
  })

  it('revokes the download’s URL later', () => {
    vi.useFakeTimers()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
      () => undefined,
    )
    const { env } = environment(undefined)
    download(file(), env)
    expect(env.url.revokeObjectURL).not.toHaveBeenCalled()
    vi.advanceTimersByTime(60_000)
    expect(env.url.revokeObjectURL).toHaveBeenCalledWith('blob:test')
    vi.useRealTimers()
  })
})
