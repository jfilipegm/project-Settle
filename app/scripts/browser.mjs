/**
 * The headless-browser driver shared by the request-privacy check
 * (`check-requests.mjs`) and the local real-receipt measurement
 * (`measure-local.mjs`, M2.5 plan, P3): a DevTools protocol client over
 * Node's built-in WebSocket (no dependency), `vite preview` serving the
 * production build, and headless Brave with a fresh temporary profile.
 */
import { spawn } from 'node:child_process'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const APP_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)

export class Cdp {
  constructor(socket) {
    this.socket = socket
    this.nextId = 1
    this.pending = new Map()
    this.listeners = []
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data))
      if (message.id !== undefined) {
        const waiter = this.pending.get(message.id)
        this.pending.delete(message.id)
        if (message.error) waiter?.reject(new Error(`${message.error.message}`))
        else waiter?.resolve(message.result)
      } else {
        for (const listener of this.listeners) listener(message)
      }
    })
  }

  static async connect(url) {
    const socket = new WebSocket(url)
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true })
      socket.addEventListener('error', reject, { once: true })
    })
    return new Cdp(socket)
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++
    const message = { id, method, params }
    if (sessionId) message.sessionId = sessionId
    this.socket.send(JSON.stringify(message))
    return new Promise((resolve, reject) =>
      this.pending.set(id, { resolve, reject }),
    )
  }

  on(listener) {
    this.listeners.push(listener)
  }

  close() {
    this.socket.close()
  }
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function waitFor(check, timeoutMs, what) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const value = await check()
    if (value) return value
    await sleep(200)
  }
  throw new Error(`Timed out waiting for ${what}`)
}

export async function startPreview(port) {
  const child = spawn(
    path.join(APP_DIR, 'node_modules', '.bin', 'vite'),
    ['preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
    { cwd: APP_DIR, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  const origin = `http://127.0.0.1:${port}`
  await waitFor(
    async () => {
      try {
        return (await fetch(`${origin}/`)).ok
      } catch {
        return false
      }
    },
    20_000,
    'vite preview',
  )
  return { child, origin }
}

export async function startBrave(bravePath) {
  const profile = await mkdtemp(path.join(tmpdir(), 'settle-brave-'))
  const child = spawn(
    bravePath,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-sync',
      'about:blank',
    ],
    { stdio: 'ignore' },
  )
  const portFile = path.join(profile, 'DevToolsActivePort')
  const [port, browserPath] = await waitFor(
    async () => {
      try {
        const lines = (await readFile(portFile, 'utf8')).trim().split('\n')
        return lines.length >= 2 ? lines : undefined
      } catch {
        return undefined
      }
    },
    20_000,
    'Brave to start',
  )
  return { child, profile, ws: `ws://127.0.0.1:${port}${browserPath}` }
}
