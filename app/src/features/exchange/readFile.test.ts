// @vitest-environment node
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { freshDb } from '../../test/households.ts'
import { buildRichHousehold, richIds } from '../../test/exchange.ts'
import { snapshotBackup, snapshotHousehold } from '../../data/exchange.ts'
import { formatFile } from './format.ts'
import {
  MAX_FILE_BYTES,
  MAX_PROBLEMS,
  isTimestamp,
  readFile,
  type FileProblem,
} from './readFile.ts'
import { migrateFile, type FileMigration } from './migrations.ts'
import {
  backupFileName,
  csvFileName,
  householdFileName,
  safeName,
} from './fileName.ts'

type Json = Record<string, unknown>
let base = ''
let backup = ''

beforeAll(async () => {
  const db = await freshDb()
  await buildRichHousehold(db, 'h1', 'Flat')
  await buildRichHousehold(db, 'h2', 'Algarve')
  base = (await snapshotHousehold(db, 'h1', '2026-10-11T15:20:00.000Z')).text
  backup = (await snapshotBackup(db, '2026-10-11T15:20:00.000Z')).text
})

/** The base file, changed by `edit` on its parsed JSON. */
function variant(edit: (file: Json, entry: Json) => void): string {
  const file = JSON.parse(base) as Json
  const entry = (file.households as Json[])[0] as Json
  edit(file, entry)
  return JSON.stringify(file)
}

function codes(text: string): FileProblem['code'][] {
  const read = readFile(text)
  if (read.ok) return []
  return read.problems.map((problem) => problem.code)
}

const list = (entry: Json, key: string) => entry[key] as Json[]
const first = (entry: Json, key: string) => list(entry, key)[0] as Json

describe('reading a Settle file, strictly (M6 plan, E2)', () => {
  it('reads a file Settle wrote', () => {
    const read = readFile(base)
    expect(read.ok).toBe(true)
    expect(readFile(backup).ok).toBe(true)
  })

  it('refuses what isn’t a Settle file', () => {
    expect(codes('not json {')).toEqual(['notJson'])
    expect(codes('[]')).toEqual(['notSettle'])
    expect(codes('{"format":"splitwise"}')).toEqual(['notSettle'])
    expect(codes('{"format":"settle","formatVersion":"1"}')).toEqual([
      'notSettle',
    ])
  })

  it('refuses a file from a newer Settle', () => {
    expect(codes(variant((file) => (file.formatVersion = 2)))).toEqual([
      'newerVersion',
    ])
  })

  it('refuses a file over 20 MB before parsing it', () => {
    const parse = vi.spyOn(JSON, 'parse')
    const huge = ' '.repeat(MAX_FILE_BYTES + 1)
    expect(codes(huge)).toEqual(['tooLarge'])
    expect(parse).not.toHaveBeenCalled()
    parse.mockRestore()
  })

  it('refuses unknown kinds, wrong household counts and unknown keys', () => {
    expect(codes(variant((file) => (file.kind = 'everything')))).toEqual([
      'unknownKind',
    ])
    expect(
      codes(
        variant((file) => {
          file.households = []
        }),
      ),
    ).toEqual(['householdCount'])
    expect(codes(variant((file) => (file.password = 'x')))).toEqual([
      'unknownKey',
    ])
    expect(codes(variant((_, entry) => (entry.notes = [])))).toEqual([
      'unknownKey',
    ])
    expect(codes(variant((file) => (file.households = {})))).toEqual([
      'badShape',
    ])
  })

  it('refuses each record kind with a missing field, a wrong type or bad content', () => {
    expect(
      codes(variant((_, entry) => delete (entry.household as Json).name)),
    ).toEqual(['unreadable'])
    expect(
      codes(variant((_, entry) => (first(entry, 'members').joinedOn = 3))),
    ).toContain('unreadable')
    expect(
      codes(variant((_, entry) => (first(entry, 'expenses').description = ''))),
    ).toContain('unreadable')
    expect(
      codes(variant((_, entry) => (first(entry, 'settlements').amount = -5))),
    ).toContain('unreadable')
  })

  it('refuses timestamps that aren’t ISO, and bad positions', () => {
    for (const field of ['createdAt', 'updatedAt', 'archivedAt']) {
      expect(
        codes(
          variant(
            (_, entry) => ((entry.household as Json)[field] = '2026-10-11'),
          ),
        ),
      ).toEqual(['badTimestamp'])
    }
    expect(
      codes(
        variant((_, entry) => (first(entry, 'expenses').updatedAt = 'today')),
      ),
    ).toEqual(['badTimestamp'])
    expect(codes(variant((file) => (file.exportedAt = 'now')))).toEqual([
      'badTimestamp',
    ])
    for (const position of [-1, 1.5, 2 ** 31]) {
      expect(
        codes(
          variant((_, entry) => (first(entry, 'members').position = position)),
        ),
      ).toContain(position === 1.5 ? 'unreadable' : 'badPosition')
    }
  })

  it('refuses a deletion with a timestamp that isn’t ISO', () => {
    const text = variant((_, entry) => {
      list(entry, 'versions').push({
        id: 'gone',
        kind: 'expense',
        clock: { a: 1 },
        deletedAt: 'last week',
      })
    })
    expect(codes(text)).toEqual(['badTimestamp'])
  })

  it('refuses dangling references, duplicate ids and bad ids', () => {
    expect(
      codes(
        variant((_, entry) => {
          const ana = richIds('h1').ana
          entry.members = list(entry, 'members').filter((m) => m.id !== ana)
          entry.versions = list(entry, 'versions').filter((v) => v.id !== ana)
        }),
      ),
    ).toContain('missingMember')
    expect(
      codes(
        variant((_, entry) => {
          list(entry, 'expenses').push(first(entry, 'expenses'))
        }),
      ),
    ).toContain('duplicateId')
    expect(
      codes(variant((_, entry) => (first(entry, 'expenses').id = 'a b'))),
    ).toContain('badId')
    // Nested: an item id in an itemised bill.
    expect(
      codes(
        variant((_, entry) => {
          const itemised = list(entry, 'expenses').find(
            (e) => (e.split as Json).kind === 'itemised',
          ) as Json
          const bill = (itemised.split as Json).bill as Json
          ;((bill.items as Json[])[0] as Json).id = 'item/1'
        }),
      ),
    ).toEqual(['badId'])
    expect(
      codes(
        variant(
          (_, entry) => (first(entry, 'expenses').householdId = 'elsewhere'),
        ),
      ),
    ).toContain('wrongHousehold')
  })

  it('refuses version problems', () => {
    const versions = (entry: Json) => list(entry, 'versions')
    expect(
      codes(variant((_, entry) => (entry.versions = versions(entry).slice(1)))),
    ).toEqual(['missingVersion'])
    expect(
      codes(
        variant((_, entry) => versions(entry).push(versions(entry)[0] as Json)),
      ),
    ).toEqual(['duplicateVersion'])
    expect(
      codes(variant((_, entry) => ((versions(entry)[0] as Json).kind = 'pet'))),
    ).toEqual(['badVersion', 'missingVersion'])
    expect(
      codes(
        variant((_, entry) => {
          const household = versions(entry).find(
            (v) => v.kind === 'household',
          ) as Json
          household.kind = 'member'
        }),
      ),
    ).toEqual(['badVersion'])
    expect(
      codes(
        variant((_, entry) =>
          versions(entry).push({ id: 'ghost', kind: 'expense', clock: {} }),
        ),
      ),
    ).toEqual(['orphanVersion'])
    expect(
      codes(
        variant((_, entry) =>
          versions(entry).push({
            id: 'h9',
            kind: 'household',
            clock: { a: 1 },
            deletedAt: '2026-10-01T00:00:00.000Z',
          }),
        ),
      ),
    ).toEqual(['deletedHousehold'])
    expect(
      codes(
        variant((_, entry) => {
          const version = versions(entry).find(
            (v) => v.kind === 'expense',
          ) as Json
          version.deletedAt = '2026-10-01T00:00:00.000Z'
        }),
      ),
    ).toContain('deletedAndPresent')
    expect(
      codes(
        variant((_, entry) =>
          versions(entry).push({
            id: 'gone',
            kind: 'expense',
            clock: {},
            deletedAt: '2026-10-01T00:00:00.000Z',
          }),
        ),
      ),
    ).toEqual(['badClock'])
  })

  it('refuses bad clocks: device ids, counts, more than 64 entries', () => {
    const clocks = [
      { 'd 1': 1 },
      { d1: 0 },
      { d1: 1.5 },
      { d1: 2 ** 31 + 1 },
      Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`d${i}`, 1])),
    ]
    for (const clock of clocks) {
      expect(
        codes(
          variant(
            (_, entry) => ((list(entry, 'versions')[0] as Json).clock = clock),
          ),
        ),
      ).toContain('badVersion')
    }
    // A record's empty clock is read (round 3, O3).
    expect(
      readFile(
        variant(
          (_, entry) => ((list(entry, 'versions')[0] as Json).clock = {}),
        ),
      ).ok,
    ).toBe(true)
  })

  it('refuses 21 people active on one day, or 51 in all', () => {
    const extra = (count: number, leftOn?: string) =>
      variant((_, entry) => {
        for (let i = 0; i < count; i++) {
          const id = `x${i}`
          list(entry, 'members').push({
            v: 1,
            id,
            householdId: 'h1',
            name: `X ${i}`,
            position: 10 + i,
            joinedOn: '2026-02-01',
            ...(leftOn === undefined ? {} : { leftOn }),
          })
          list(entry, 'versions').push({ id, kind: 'member', clock: {} })
        }
      })
    expect(codes(extra(16))).toEqual([])
    const crowded = readFile(extra(17))
    expect(crowded.ok).toBe(false)
    if (!crowded.ok) {
      expect(crowded.problems).toEqual([
        expect.objectContaining({ code: 'tooManyActive', date: '2026-02-01' }),
      ])
    }
    // 47 more who each stay a day: never 21 at once, but 51 in all.
    const many = variant((_, entry) => {
      for (let i = 0; i < 47; i++) {
        const id = `y${i}`
        const day = `2026-03-${String((i % 28) + 1).padStart(2, '0')}`
        list(entry, 'members').push({
          v: 1,
          id,
          householdId: 'h1',
          name: `Y ${i}`,
          position: 10 + i,
          joinedOn: i < 28 ? day : day.replace('-03-', '-04-'),
          leftOn: i < 28 ? day : day.replace('-03-', '-04-'),
        })
        list(entry, 'versions').push({ id, kind: 'member', clock: {} })
      }
    })
    expect(codes(many)).toEqual(['tooManyMembers'])
  })

  it('names at most five problems, and counts the rest', () => {
    const text = variant((_, entry) => {
      for (const expense of list(entry, 'expenses')) expense.description = ''
      for (const member of list(entry, 'members')) member.name = ''
    })
    const read = readFile(text)
    expect(read.ok).toBe(false)
    if (!read.ok) {
      expect(read.problems).toHaveLength(MAX_PROBLEMS)
      expect(read.total).toBeGreaterThan(MAX_PROBLEMS)
    }
  })

  it('names the record a problem is about', () => {
    const read = readFile(
      variant((_, entry) => {
        const ana = richIds('h1').ana
        entry.members = list(entry, 'members').filter((m) => m.id !== ana)
        entry.versions = list(entry, 'versions').filter((v) => v.id !== ana)
      }),
    )
    expect(read.ok).toBe(false)
    if (!read.ok) {
      expect(read.problems[0]).toEqual({
        code: 'missingMember',
        record: {
          kind: 'expense',
          id: 'h1-it1',
          label: 'Continente',
          date: '2026-09-10',
        },
      })
    }
  })

  it('drops __proto__ and other unknown keys inside a record', () => {
    const text = base.replace(
      '"description": "Continente",',
      '"description": "Continente", "__proto__": {"polluted": true}, "extra": 1,',
    )
    const read = readFile(text)
    if (!read.ok) throw new Error(JSON.stringify(read.problems))
    const expense = read.file.households[0]?.expenses.find(
      (e) => e.id === 'h1-it1',
    )
    expect(expense).toBeDefined()
    expect(Object.keys(expense ?? {})).not.toContain('extra')
    expect(Object.prototype.hasOwnProperty.call(expense, '__proto__')).toBe(
      false,
    )
    expect(({} as Json).polluted).toBeUndefined()
    // Dropping them gives back the canonical file.
    expect(formatFile(read.file)).toBe(base)
  })

  it('accepts ISO timestamps only', () => {
    expect(isTimestamp('2026-10-11T15:20:00.000Z')).toBe(true)
    expect(isTimestamp('2026-10-11T15:20:00Z')).toBe(true)
    for (const bad of [
      '2026-10-11',
      '2026-02-30T00:00:00.000Z',
      '2026-10-11T25:00:00.000Z',
      '2026-10-11T15:20:00+01:00',
      'x',
    ]) {
      expect(isTimestamp(bad)).toBe(false)
    }
  })
})

describe('older files go through the migrations (E3)', () => {
  /** A test-only version 2: the same shape, so a version-1 file upgrades. */
  const toV2: FileMigration = (file) => ({ ...file })

  it('upgrades a version-1 file with every record intact', () => {
    const step = vi.fn(toV2)
    const read = readFile(base, { migrations: [step] })
    expect(step).toHaveBeenCalledOnce()
    if (!read.ok) throw new Error(JSON.stringify(read.problems))
    expect(read.file.formatVersion).toBe(2)
    const plain = readFile(base)
    if (!plain.ok) throw new Error('base unreadable')
    expect(read.file.households).toEqual(plain.file.households)
  })

  it('runs no step for a file already at the known version', () => {
    expect(migrateFile({ formatVersion: 2 }, 2, [toV2])).toEqual({
      formatVersion: 2,
    })
  })

  it('refuses a file when a step fails', () => {
    const failing: FileMigration = () => {
      throw new Error('broken')
    }
    const read = readFile(base, { migrations: [failing] })
    expect(read.ok ? [] : read.problems).toEqual([{ code: 'migrationFailed' }])
  })

  it('still refuses a version above the known one', () => {
    const v3 = variant((file) => (file.formatVersion = 3))
    const read = readFile(v3, { migrations: [toV2] })
    expect(read.ok ? [] : read.problems).toEqual([{ code: 'newerVersion' }])
  })
})

describe('file names (E1)', () => {
  it('names household, backup and CSV files', () => {
    expect(householdFileName('Flat', '2026-10-11T15:20:00.000Z')).toBe(
      'Settle - Flat - 2026-10-11.json',
    )
    expect(backupFileName('backup', '2026-10-11')).toBe(
      'Settle backup 2026-10-11.json',
    )
    expect(csvFileName('Flat', '2026-10-11')).toBe(
      'Settle - Flat - 2026-10-11.csv',
    )
  })

  it('replaces characters a file system refuses', () => {
    expect(safeName('Casa: 1/2 "A" <b>?*|\\')).toBe('Casa- 1-2 -A- -b-----')
    expect(safeName('a\tb\u0000c')).toBe('a-b-c')
    expect(safeName('..')).toBe('-')
    expect(householdFileName('Rua das Flores 12', '2026-10-11')).toBe(
      'Settle - Rua das Flores 12 - 2026-10-11.json',
    )
  })
})
