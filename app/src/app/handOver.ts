/**
 * Handing a file to the user (M6 plan, E7): the phone's share sheet when
 * the browser can share files (phones over HTTPS), otherwise a download
 * through `<a download href="blob:…">`, which needs no new CSP source.
 * Nothing is uploaded: the file leaves only through the user's own share
 * sheet or a download.
 */

export type HandOver = 'shared' | 'downloaded' | 'cancelled'

export interface HandOverEnvironment {
  navigator: Pick<Navigator, 'share' | 'canShare'> | undefined
  document: Document
  url: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>
}

function browserEnvironment(): HandOverEnvironment {
  return {
    navigator: typeof navigator === 'undefined' ? undefined : navigator,
    document,
    url: URL,
  }
}

function canShareFile(
  nav: HandOverEnvironment['navigator'],
  file: File,
): boolean {
  try {
    return (
      typeof nav?.share === 'function' &&
      typeof nav.canShare === 'function' &&
      nav.canShare({ files: [file] })
    )
  } catch {
    return false
  }
}

/** Downloads `file` under its own name. */
export function download(
  file: File,
  env: HandOverEnvironment = browserEnvironment(),
): void {
  const href = env.url.createObjectURL(file)
  const link = env.document.createElement('a')
  link.href = href
  link.download = file.name
  link.rel = 'noopener'
  link.style.display = 'none'
  env.document.body.append(link)
  link.click()
  link.remove()
  // Some browsers read the blob after the click returns.
  setTimeout(() => {
    env.url.revokeObjectURL(href)
  }, 60_000)
}

/**
 * Shares `file`, or downloads it. A cancelled share is not an error (M5's
 * rule): it resolves `cancelled` and nothing else happens. Any other
 * share failure falls back to the download.
 */
export async function handOver(
  file: File,
  env: HandOverEnvironment = browserEnvironment(),
): Promise<HandOver> {
  if (canShareFile(env.navigator, file) && env.navigator !== undefined) {
    try {
      await env.navigator.share({ files: [file] })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return 'cancelled'
      }
    }
  }
  download(file, env)
  return 'downloaded'
}
