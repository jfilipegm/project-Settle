import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  META,
  STORE,
  openDatabase,
  result,
  transaction,
} from '../../data/db.ts'
import {
  createHousehold,
  getBackupStatus,
  saveExpense,
} from '../../data/repository.ts'
import { readFile } from '../../features/exchange/readFile.ts'
import { isoDate } from '../../features/household/model.ts'
import { LANGUAGE_STORAGE_KEY } from '../../i18n/language.ts'
import {
  equalSplit,
  fourMembers,
  household,
  putRaw,
  quickExpense,
} from '../../test/households.ts'
import { english, shownText } from '../../test/portuguese.ts'
import { renderApp, stubIndexedDb } from '../../test/renderApp.tsx'
import { SNOOZE_KEY } from './BackupReminder.tsx'

let factory: IDBFactory
let downloads: File[]

beforeEach(() => {
  factory = stubIndexedDb()
  downloads = []
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    downloads.push(blob as File)
    return 'blob:test'
  })
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
    () => undefined,
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
})

async function seed() {
  const db = await openDatabase(factory)
  await createHousehold(db, household(), fourMembers())
  await saveExpense(db, quickExpense('e1', equalSplit(1000, ['ana'])))
  return db
}

/** Marks the first unbacked change `days` days ago. */
async function changedDaysAgo(db: IDBDatabase, days: number) {
  const at = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  await transaction(db, [STORE.meta], 'readwrite', (tx) =>
    result(
      tx
        .objectStore(STORE.meta)
        .put({ key: META.firstUnbackedChangeAt, value: at }),
    ),
  )
}

const today = isoDate(new Date())

describe('Share and export on the Members tab (M6 plan, E7, E9)', () => {
  it('says what the file holds, and downloads it where sharing files isn’t possible', async () => {
    ;(await seed()).close()
    renderApp('/households/h1/members')
    const card = await screen.findByRole('region', {
      name: 'Share and export',
    })
    expect(
      within(card).getByText(
        'The file has names, amounts, dates, descriptions and shop names. Anyone who gets it can read it.',
      ),
    ).toBeInTheDocument()
    fireEvent.click(
      within(card).getByRole('button', { name: 'Share household file' }),
    )
    expect(
      await within(card).findByText(
        'File ready. Send it to your housemates; they open it with Open a Settle file.',
      ),
    ).toBeInTheDocument()
    expect(downloads).toHaveLength(1)
    const [file] = downloads
    expect(file?.name).toBe(`Settle - Rua das Flores 12 - ${today}.json`)
    expect(file?.type).toBe('application/json')
    const read = readFile((await file?.text()) ?? '')
    expect(read.ok && read.file.households[0]?.expenses).toHaveLength(1)
  })

  it('opens the share sheet with the file where the browser can share files', async () => {
    ;(await seed()).close()
    const share = vi.fn<(data: ShareData) => Promise<void>>(() =>
      Promise.resolve(),
    )
    vi.stubGlobal('navigator', {
      ...navigator,
      share,
      canShare: () => true,
      languages: navigator.languages,
    })
    renderApp('/households/h1/members')
    fireEvent.click(
      await screen.findByRole('button', { name: 'Share household file' }),
    )
    await screen.findByText(/File ready/)
    expect(share).toHaveBeenCalledOnce()
    expect(share.mock.calls[0]?.[0].files?.[0]?.name).toMatch(
      /^Settle - Rua das Flores 12 - /,
    )
    expect(downloads).toEqual([])
  })

  it('says nothing when the share is cancelled', async () => {
    ;(await seed()).close()
    vi.stubGlobal('navigator', {
      ...navigator,
      share: () => Promise.reject(new DOMException('no', 'AbortError')),
      canShare: () => true,
      languages: navigator.languages,
    })
    renderApp('/households/h1/members')
    const button = await screen.findByRole('button', {
      name: 'Share household file',
    })
    fireEvent.click(button)
    await waitFor(() => {
      expect(button).toBeEnabled()
    })
    expect(screen.queryByText(/File ready/)).toBeNull()
    expect(downloads).toEqual([])
  })

  it('names the records that stay out before making the file', async () => {
    const db = await seed()
    await putRaw(db, {
      households: [],
      members: [],
      expenses: [
        quickExpense('loose', equalSplit(1000, ['ana']), {
          createdAt: 'yesterday',
        }),
      ],
    })
    db.close()
    renderApp('/households/h1/members')
    fireEvent.click(
      await screen.findByRole('button', { name: 'Share household file' }),
    )
    expect(
      await screen.findByText(
        '1 record isn’t in the file: 1 has a value a file can’t hold. They stay on this phone.',
      ),
    ).toBeInTheDocument()
    expect(downloads).toEqual([])
    fireEvent.click(
      screen.getByRole('button', { name: 'Make the file anyway' }),
    )
    await screen.findByText(/File ready/)
    expect(downloads).toHaveLength(1)
  })
})

describe('Your data in Settings (M6 plan, E10)', () => {
  it('backs up every household, and records it', async () => {
    const db = await seed()
    await createHousehold(db, household('h2', 'Algarve 2026'), [])
    renderApp('/settings')
    const card = await screen.findByRole('region', { name: 'Your data' })
    expect(await within(card).findByText('No backup yet')).toBeInTheDocument()
    fireEvent.click(within(card).getByRole('button', { name: 'Back up now' }))
    expect(
      await within(card).findByText(
        'Backup ready. Keep the file somewhere other than this phone.',
      ),
    ).toBeInTheDocument()
    expect(downloads[0]?.name).toBe(`Settle backup ${today}.json`)
    const read = readFile((await downloads[0]?.text()) ?? '')
    expect(read.ok && read.file.kind).toBe('backup')
    expect(read.ok && read.file.households).toHaveLength(2)
    expect(await within(card).findByText(/^Last backup: /)).toBeInTheDocument()
    const status = await getBackupStatus(db)
    expect(status.lastBackupAt).toBeDefined()
    expect(status.firstUnbackedChangeAt).toBeUndefined()
    db.close()
  })

  it('opens a Settle file from Restore from a file', async () => {
    ;(await seed()).close()
    renderApp('/settings')
    fireEvent.click(
      await screen.findByRole('button', { name: 'Restore from a file' }),
    )
    expect(
      await screen.findByRole('heading', { name: 'Open a Settle file' }),
    ).toBeInTheDocument()
  })
})

describe('the backup reminder (M6 plan, E10)', () => {
  it('shows after 7 days of unbacked changes, on Households and the Overview', async () => {
    const db = await seed()
    await changedDaysAgo(db, 9)
    db.close()
    renderApp('/households')
    const reminder = await screen.findByRole('region', {
      name: 'Backup reminder',
    })
    expect(
      within(reminder).getByText(
        'Your changes from the last 9 days aren’t backed up.',
      ),
    ).toBeInTheDocument()
  })

  it('shows on the household’s Overview too', async () => {
    const db = await seed()
    await changedDaysAgo(db, 8)
    db.close()
    renderApp('/households/h1')
    expect(
      await screen.findByText(
        'Your changes from the last 8 days aren’t backed up.',
      ),
    ).toBeInTheDocument()
  })

  it('stays hidden before 7 days', async () => {
    const db = await seed()
    await changedDaysAgo(db, 6)
    db.close()
    renderApp('/households')
    await screen.findByRole('link', { name: 'Rua das Flores 12' })
    expect(screen.queryByRole('region', { name: 'Backup reminder' })).toBeNull()
  })

  it('hides for 7 days with Later', async () => {
    const db = await seed()
    await changedDaysAgo(db, 9)
    db.close()
    renderApp('/households')
    const reminder = await screen.findByRole('region', {
      name: 'Backup reminder',
    })
    fireEvent.click(within(reminder).getByRole('button', { name: 'Later' }))
    expect(screen.queryByRole('region', { name: 'Backup reminder' })).toBeNull()
    const until = Date.parse(localStorage.getItem(SNOOZE_KEY) ?? '')
    expect(until - Date.now()).toBeGreaterThan(6.9 * 24 * 60 * 60 * 1000)
  })

  it('backs up from the reminder', async () => {
    const db = await seed()
    await changedDaysAgo(db, 9)
    renderApp('/households')
    const reminder = await screen.findByRole('region', {
      name: 'Backup reminder',
    })
    fireEvent.click(
      within(reminder).getByRole('button', { name: 'Back up now' }),
    )
    await within(reminder).findByText(/Backup ready/)
    expect(downloads).toHaveLength(1)
    expect((await getBackupStatus(db)).firstUnbackedChangeAt).toBeUndefined()
    db.close()
  })
})

describe('Open a Settle file from the Households page (E7)', () => {
  it('has the button, and Restore from a backup on a new phone', async () => {
    renderApp('/households')
    fireEvent.click(
      await screen.findByRole('button', { name: 'Restore from a backup' }),
    )
    expect(
      await screen.findByRole('heading', { name: 'Open a Settle file' }),
    ).toBeInTheDocument()
  })

  it('opens it from the list', async () => {
    ;(await seed()).close()
    renderApp('/households')
    fireEvent.click(
      await screen.findByRole('button', { name: 'Open a Settle file' }),
    )
    expect(
      await screen.findByRole('heading', { name: 'Open a Settle file' }),
    ).toBeInTheDocument()
  })
})

describe('in Portuguese', () => {
  it('renders the cards and the reminder with no English', async () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'pt')
    const db = await seed()
    await changedDaysAgo(db, 9)
    db.close()
    const members = renderApp('/households/h1/members')
    await screen.findByRole('button', { name: 'Partilhar o ficheiro da casa' })
    expect(english(shownText(members.container))).toEqual([])
    members.unmount()
    const settings = renderApp('/settings')
    await screen.findByRole('button', { name: 'Fazer cópia agora' })
    expect(english(shownText(settings.container))).toEqual([])
    settings.unmount()
    const list = renderApp('/households')
    await screen.findByText(
      'As alterações dos últimos 9 dias não têm cópia de segurança.',
    )
    expect(english(shownText(list.container))).toEqual([])
  })
})
