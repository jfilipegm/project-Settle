import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase } from '../../data/db.ts'
import {
  applyImport,
  prepareImport,
  snapshotBackup,
  snapshotHousehold,
} from '../../data/exchange.ts'
import {
  createHousehold,
  getExpense,
  listHouseholds,
  saveExpense,
} from '../../data/repository.ts'
import { readFile } from '../../features/exchange/readFile.ts'
import { LANGUAGE_STORAGE_KEY } from '../../i18n/language.ts'
import {
  NOW,
  equalSplit,
  fourMembers,
  household,
  member,
  quickExpense,
} from '../../test/households.ts'
import { english, shownText } from '../../test/portuguese.ts'
import { renderApp, stubIndexedDb } from '../../test/renderApp.tsx'

let factory: IDBFactory

beforeEach(() => {
  factory = stubIndexedDb()
})

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

/** This device's database, for seeding and checking. */
async function device() {
  return openDatabase(factory)
}

/** Another phone, with its own database. */
async function otherPhone() {
  return openDatabase(new IDBFactory())
}

async function textOf(db: IDBDatabase, householdId = 'h1') {
  return (await snapshotHousehold(db, householdId, NOW)).text
}

/** The other phone opens this device's household file. */
async function copyTo(from: IDBDatabase, to: IDBDatabase) {
  const read = readFile(await textOf(from))
  if (!read.ok) throw new Error('unreadable')
  await applyImport(to, read.file, await prepareImport(to, read.file), {})
}

/** Chooses a file once the picker is ready (the database is open). */
async function choose(
  text: string,
  name = 'Settle - Rua das Flores 12.json',
  label = 'Settle file',
) {
  const input = await screen.findByLabelText(label)
  await waitFor(() => {
    expect(input).toBeEnabled()
  })
  fireEvent.change(input, {
    target: { files: [new File([text], name, { type: 'application/json' })] },
  })
}

/** A household here and on another phone, with e1 changed on both. */
async function conflictFile() {
  const here = await device()
  await createHousehold(here, household(), fourMembers())
  await saveExpense(here, quickExpense('e1', equalSplit(1000, ['ana'])))
  const other = await otherPhone()
  await copyTo(here, other)
  await saveExpense(here, quickExpense('e1', equalSplit(2340, ['ana'])), [], {
    replacing: true,
  })
  await saveExpense(other, quickExpense('e1', equalSplit(3240, ['ana'])), [], {
    replacing: true,
  })
  const text = await textOf(other)
  here.close()
  other.close()
  return text
}

describe('Open a Settle file (M6 plan, E7, E8)', () => {
  it('adds a household that isn’t on this device', async () => {
    const other = await otherPhone()
    await createHousehold(other, household(), fourMembers())
    await saveExpense(other, quickExpense('e1', equalSplit(1000, ['ana'])))
    const text = await textOf(other)

    renderApp('/import')
    await choose(text)

    expect(
      await screen.findByText(
        'Rua das Flores 12: new on this device. 4 people, 1 expense, 0 payments.',
      ),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(
      await screen.findByText('Rua das Flores 12 now has 1 expense.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Open Rua das Flores 12' }),
    ).toHaveAttribute('href', '/households/h1')
    const db = await device()
    expect((await listHouseholds(db)).items).toHaveLength(1)
    db.close()
  })

  it('shows a conflict as a pair, and applies only once it is decided', async () => {
    const text = await conflictFile()
    renderApp('/import')
    await choose(text)

    const group = await screen.findByRole('group', {
      name: 'Changed on both phones: The expense “Groceries” on 1 Oct',
    })
    expect(within(group).getByText(/This phone/)).toBeInTheDocument()
    expect(within(group).getByText(/23\.40|23,40/)).toBeInTheDocument()
    expect(within(group).getByText(/32\.40|32,40/)).toBeInTheDocument()
    expect(
      within(group).getByText('What differs: the amount.'),
    ).toBeInTheDocument()

    const apply = screen.getByRole('button', { name: 'Apply' })
    expect(apply).toBeDisabled()
    // The reason sits next to Apply, read out by screen readers.
    expect(
      screen.getByText('Choose for 1 record before you apply.'),
    ).toHaveAttribute('aria-live', 'polite')

    const theirs = within(group).getByRole('radio', { name: 'Use theirs' })
    const mine = within(group).getByRole('radio', { name: 'Keep mine' })
    fireEvent.click(mine)
    expect(apply).toBeEnabled()
    fireEvent.click(theirs)
    expect(theirs).toBeChecked()
    expect(mine).not.toBeChecked()

    fireEvent.click(apply)
    await screen.findByText('Rua das Flores 12 now has 1 expense.')
    const db = await device()
    const expense = await getExpense(db, 'e1')
    expect(expense?.split.kind === 'equal' && expense.split.amount).toBe(3240)
    db.close()
  })

  it('writes nothing on Cancel', async () => {
    const text = await conflictFile()
    renderApp('/import')
    await choose(text)
    const group = await screen.findByRole('group', {
      name: /Changed on both phones/,
    })
    fireEvent.click(within(group).getByRole('radio', { name: 'Use theirs' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByLabelText('Settle file')).toBeInTheDocument()
    const db = await device()
    const expense = await getExpense(db, 'e1')
    expect(expense?.split.kind === 'equal' && expense.split.amount).toBe(2340)
    db.close()
  })

  it('refuses a damaged file with its reason, and offers another', async () => {
    renderApp('/import')
    await choose('{"format": "settle", ', 'broken.json')
    const alert = await screen.findByRole('alert')
    expect(
      within(alert).getByRole('heading', { name: 'This file can’t be opened' }),
    ).toBeInTheDocument()
    expect(
      within(alert).getByText('The file is damaged (it isn’t valid JSON).'),
    ).toBeInTheDocument()
    fireEvent.click(
      within(alert).getByRole('button', { name: 'Choose another file' }),
    )
    expect(screen.getByLabelText('Settle file')).toBeInTheDocument()
  })

  it('names the record a refused file’s problem is about', async () => {
    const other = await otherPhone()
    await createHousehold(other, household(), fourMembers())
    await saveExpense(other, quickExpense('e1', equalSplit(1000, ['ana'])))
    const file = JSON.parse(await textOf(other)) as {
      households: { members: { id: string }[]; versions: { id: string }[] }[]
    }
    const entry = file.households[0]
    if (entry === undefined) throw new Error()
    entry.members = entry.members.filter((m) => m.id !== 'ana')
    entry.versions = entry.versions.filter((v) => v.id !== 'ana')

    renderApp('/import')
    await choose(JSON.stringify(file))
    expect(
      await screen.findByText(
        'The expense “Groceries” on 1 Oct names a member who isn’t in the file.',
      ),
    ).toBeInTheDocument()
  })

  it('refuses a file from a newer Settle', async () => {
    renderApp('/import')
    await choose('{"format": "settle", "formatVersion": 9}')
    expect(
      await screen.findByText(
        'This file was made by a newer Settle. Update Settle to open it.',
      ),
    ).toBeInTheDocument()
  })

  it('restores a backup of several households in one Apply', async () => {
    const other = await otherPhone()
    await createHousehold(other, household(), fourMembers())
    await createHousehold(other, household('h2', 'Algarve 2026'), [
      member('rui', 'Rui', 0, { householdId: 'h2' }),
    ])
    const { text } = await snapshotBackup(other, NOW)

    renderApp('/import')
    await choose(text, 'Settle backup 2026-10-11.json')
    expect(
      await screen.findByText(/Algarve 2026: new on this device/),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Rua das Flores 12: new on this device/),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Restoring adds what this phone is missing. It doesn’t undo changes made since the backup.',
      ),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(
      await screen.findByRole('link', { name: 'Open Algarve 2026' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Open Rua das Flores 12' }),
    ).toBeInTheDocument()
  })

  it('says when there is nothing new', async () => {
    const here = await device()
    await createHousehold(here, household(), fourMembers())
    const text = await textOf(here)
    here.close()
    renderApp('/import')
    await choose(text)
    expect(
      await screen.findByText('Nothing new in this file.'),
    ).toBeInTheDocument()
  })

  it('asks to review again when another tab changed the data', async () => {
    const text = await conflictFile()
    renderApp('/import')
    await choose(text)
    const group = await screen.findByRole('group', {
      name: /Changed on both phones/,
    })
    fireEvent.click(within(group).getByRole('radio', { name: 'Use theirs' }))
    const db = await device()
    await saveExpense(db, quickExpense('e1', equalSplit(5000, ['ana'])), [], {
      replacing: true,
    })
    db.close()
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(
      await screen.findByText(
        'Your data changed while you were reviewing. Review the file again.',
      ),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Review again' }))
    await waitFor(() => {
      expect(
        screen.getByRole('radio', { name: 'Use theirs' }),
      ).not.toBeChecked()
    })
  })

  it('renders the preview in Portuguese', async () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'pt')
    const text = await conflictFile()
    const { container } = renderApp('/import')
    await choose(text, 'casa.json', 'Ficheiro do Settle')
    await screen.findByRole('group', { name: /Alterado nos dois telemóveis/ })
    expect(english(shownText(container))).toEqual([])
  })
})
