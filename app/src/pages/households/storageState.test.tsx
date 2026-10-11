import { fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSchemaV1, openDatabase } from '../../data/db.ts'
import { LANGUAGE_STORAGE_KEY } from '../../i18n/language.ts'
import {
  fourMembers,
  getRaw,
  household,
  putRaw,
} from '../../test/households.ts'
import { english, shownText } from '../../test/portuguese.ts'
import { renderApp, stubIndexedDb } from '../../test/renderApp.tsx'

/*
 * A failed upgrade has its own state (M5 plan, B3; M4's O-4): nothing was
 * changed, Reload tries again, and the split stays one link away.
 */

afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})

/**
 * A version-1 database the version-2 step can't upgrade: a stray
 * `settlements` store already exists, so creating it throws and the whole
 * upgrade is rolled back.
 */
async function unupgradable(): Promise<IDBFactory> {
  const factory = stubIndexedDb()
  const db = await openDatabase(factory, {
    migrations: [
      (database, tx) => {
        createSchemaV1(database, tx)
        database.createObjectStore('settlements', { keyPath: 'id' })
      },
    ],
  })
  await putRaw(db, {
    households: [household()],
    members: fourMembers(),
    expenses: [],
  })
  db.close()
  return factory
}

describe('a failed upgrade (O-4)', () => {
  it('says nothing was changed, offers Reload and the split', async () => {
    const factory = await unupgradable()
    renderApp('/households/h1')
    expect(
      await screen.findByRole('heading', {
        name: 'Settle couldn’t update its data',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /couldn’t update the data on this device\. Nothing was changed\./,
      ),
    ).toBeInTheDocument()
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(reload).toHaveBeenCalledOnce()
    expect(screen.queryByText(/can’t be saved here/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Split a bill' })).toHaveAttribute(
      'href',
      '/split',
    )

    // The version-1 data is still there, unchanged.
    const db = await openDatabase(factory, { migrations: [createSchemaV1] })
    expect(db.version).toBe(1)
    const raw = await getRaw(db)
    expect(raw.households).toEqual([household()])
    expect(raw.members).toHaveLength(4)
    db.close()
  })

  it('says so in Portuguese', async () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'pt')
    await unupgradable()
    const { container } = renderApp('/households/h1')
    expect(
      await screen.findByRole('heading', {
        name: 'O Settle não conseguiu atualizar os dados',
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Recarregar' })).toBeVisible()
    expect(english(shownText(container))).toEqual([])
  })
})
