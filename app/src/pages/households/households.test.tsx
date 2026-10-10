import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../../data/db.ts'
import { HOUSEHOLD_POINTER_KEY } from '../../data/pointer.ts'
import {
  createHousehold,
  listHouseholds,
  listMembers,
  saveExpense,
} from '../../data/repository.ts'
import { LANGUAGE_STORAGE_KEY } from '../../i18n/language.ts'
import {
  equalSplit,
  fourMembers,
  household,
  quickExpense,
} from '../../test/households.ts'
import { english, shownText } from '../../test/portuguese.ts'
import { renderApp, stubIndexedDb } from '../../test/renderApp.tsx'
import { vi } from 'vitest'

let factory: IDBFactory

beforeEach(() => {
  factory = stubIndexedDb()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function seed(withExpense = false) {
  const db = await openDatabase(factory)
  await createHousehold(db, household(), fourMembers())
  if (withExpense) {
    await saveExpense(
      db,
      quickExpense('e1', equalSplit(1000, ['ana', 'marta'])),
    )
  }
  db.close()
}

function memberRow(name: string) {
  const row = screen
    .getAllByRole('listitem')
    .find((item) => within(item).queryByText(name) !== null)
  if (row === undefined) throw new Error(`no row for ${name}`)
  return row
}

describe('the households list (M4 plan, H9)', () => {
  it('starts empty, creates a household with its people, and opens it', async () => {
    renderApp('/household')

    expect(
      await screen.findByRole('heading', { name: 'No households yet' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'New household' }))

    const dialog = screen.getByRole('dialog', { name: 'New household' })
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Create household' }),
    )
    expect(within(dialog).getByText('Give it a name.')).toBeInTheDocument()

    fireEvent.change(within(dialog).getByLabelText('Household name'), {
      target: { value: 'Rua das Flores 12' },
    })
    fireEvent.change(within(dialog).getByLabelText('Name of person 1'), {
      target: { value: 'Ana' },
    })
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Add a person' }),
    )
    fireEvent.change(within(dialog).getByLabelText('Name of person 2'), {
      target: { value: '  Marta ' },
    })
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Create household' }),
    )

    expect(
      await screen.findByRole('link', {
        name: 'Rua das Flores 12, switch household',
      }),
    ).toBeInTheDocument()
    const tabs = screen.getByRole('navigation', { name: 'Household' })
    expect(
      within(tabs).getByRole('link', { name: 'Overview' }),
    ).toHaveAttribute('aria-current', 'page')
    expect(localStorage.getItem(HOUSEHOLD_POINTER_KEY)).not.toBeNull()

    fireEvent.click(within(tabs).getByRole('link', { name: 'Members' }))
    expect(await screen.findByText('Marta')).toBeInTheDocument()
    expect(screen.getByText('Ana')).toBeInTheDocument()
  })

  it('creates one household when Create is pressed twice', async () => {
    renderApp('/households')
    fireEvent.click(
      await screen.findByRole('button', { name: 'New household' }),
    )
    const dialog = screen.getByRole('dialog', { name: 'New household' })
    fireEvent.change(within(dialog).getByLabelText('Household name'), {
      target: { value: 'Rua das Flores 12' },
    })
    const create = within(dialog).getByRole('button', {
      name: 'Create household',
    })
    fireEvent.click(create)
    fireEvent.click(create)

    await screen.findByRole('link', {
      name: 'Rua das Flores 12, switch household',
    })
    const db = await openDatabase(factory)
    try {
      expect((await listHouseholds(db)).items).toHaveLength(1)
    } finally {
      db.close()
    }
  })

  it('opens the household used last from the Household tab', async () => {
    await seed()
    localStorage.setItem(HOUSEHOLD_POINTER_KEY, 'h1')
    renderApp('/household')

    expect(
      await screen.findByRole('link', {
        name: 'Rua das Flores 12, switch household',
      }),
    ).toBeInTheDocument()
  })

  it('shows Not found for an unknown household', async () => {
    renderApp('/households/nope')
    expect(
      await screen.findByRole('heading', { name: 'Page not found' }),
    ).toBeInTheDocument()
  })

  it('archives a household and restores it', async () => {
    await seed()
    renderApp('/households/h1/members')

    fireEvent.click(
      await screen.findByRole('button', { name: 'Archive household' }),
    )
    const dialog = screen.getByRole('dialog', {
      name: 'Archive Rua das Flores 12?',
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Archive' }))

    const archived = await screen.findByRole('region', { name: 'Archived' })
    fireEvent.click(
      within(archived).getByRole('button', {
        name: 'Restore Rua das Flores 12',
      }),
    )
    expect(
      await screen.findByRole('link', { name: 'Rua das Flores 12' }),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(
        screen.queryByRole('region', { name: 'Archived' }),
      ).not.toBeInTheDocument(),
    )
  })
})

describe('members (M4 plan, H7)', () => {
  it('adds one member when Add is pressed twice', async () => {
    await seed()
    renderApp('/households/h1/members')

    const add = await screen.findByRole('region', { name: 'Add a person' })
    fireEvent.change(within(add).getByLabelText('Name'), {
      target: { value: 'Rui' },
    })
    const button = within(add).getByRole('button', { name: 'Add' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(await screen.findByText('Rui')).toBeInTheDocument()

    const db = await openDatabase(factory)
    try {
      const { items } = await listMembers(db, 'h1')
      expect(items.filter((m) => m.name === 'Rui')).toHaveLength(1)
    } finally {
      db.close()
    }
  })

  it('adds, renames, marks as left and undoes leaving', async () => {
    await seed()
    renderApp('/households/h1/members')

    const add = await screen.findByRole('region', { name: 'Add a person' })
    fireEvent.change(within(add).getByLabelText('Name'), {
      target: { value: 'Rui' },
    })
    fireEvent.click(within(add).getByRole('button', { name: 'Add' }))
    expect(await screen.findByText('Rui')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Rename Rui' }))
    const rename = screen.getByRole('dialog', { name: 'Rename Rui' })
    fireEvent.change(within(rename).getByLabelText('Name'), {
      target: { value: 'Rui S.' },
    })
    fireEvent.click(within(rename).getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Rui S.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Mark Tiago as left' }))
    const leave = screen.getByRole('dialog', { name: 'Tiago has left' })
    fireEvent.change(within(leave).getByLabelText('Date they left'), {
      target: { value: '2025-01-01' },
    })
    fireEvent.click(within(leave).getByRole('button', { name: 'Mark as left' }))
    expect(
      within(leave).getByText('They can’t leave before they joined.'),
    ).toBeInTheDocument()
    fireEvent.change(within(leave).getByLabelText('Date they left'), {
      target: { value: '2026-09-30' },
    })
    fireEvent.click(within(leave).getByRole('button', { name: 'Mark as left' }))

    const left = await screen.findByRole('region', { name: 'Left' })
    expect(await within(left).findByText('Tiago')).toBeInTheDocument()
    expect(within(left).getByText('Left 30 Sept 2026')).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'Undo leaving for Tiago' }),
    )
    expect(
      await within(left).findByText('Nobody has left.'),
    ).toBeInTheDocument()
  })

  it('deletes an unused member, and refuses one on an expense', async () => {
    await seed(true)
    renderApp('/households/h1/members')

    fireEvent.click(await screen.findByRole('button', { name: 'Delete Tiago' }))
    let dialog = screen.getByRole('dialog', { name: 'Delete Tiago?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() =>
      expect(screen.queryByText('Tiago')).not.toBeInTheDocument(),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Delete Marta' }))
    dialog = screen.getByRole('dialog', { name: 'Delete Marta?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(
      await screen.findByText(
        'Marta is on expenses or payments, so they can’t be deleted. Mark them as left instead.',
      ),
    ).toBeInTheDocument()
    expect(memberRow('Marta')).toBeInTheDocument()

    const db = await openDatabase(factory)
    expect((await listMembers(db, 'h1')).items.map((m) => m.id)).toContain(
      'marta',
    )
    db.close()
  })

  it('points to Members from an overview with nobody in it', async () => {
    const db = await openDatabase(factory)
    await createHousehold(db, household(), [])
    db.close()
    renderApp('/households/h1')

    expect(
      await screen.findByRole('heading', {
        name: 'Add the people who share costs',
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to Members' })).toHaveAttribute(
      'href',
      '/households/h1/members',
    )
  })
})

describe('the household pages in Portuguese', () => {
  beforeEach(() => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'pt')
  })

  it.each([
    '/households',
    '/households/h1',
    '/households/h1/members',
    '/households/h1/expenses',
  ])('%s shows no English', async (path) => {
    await seed()
    const { container } = renderApp(path)
    await screen.findByRole('navigation', { name: 'Principal' })
    await waitFor(() => expect(container.querySelector('h1')).not.toBeNull())
    // Wait for the data to load.
    await waitFor(() =>
      expect(shownText(container)).toMatch(/Rua das Flores 12/),
    )
    expect(english(shownText(container))).toEqual([])
  })

  it('labels the household tabs exactly', async () => {
    await seed()
    renderApp('/households/h1')
    const tabs = await screen.findByRole('navigation', { name: 'Casa' })
    expect(
      within(tabs)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Resumo', 'Despesas', 'Saldos', 'Membros'])
  })
})
