import { renderHook } from '@testing-library/react'
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBill } from './billReducer.ts'
import { DRAFT_STORAGE_KEY, loadDraft, saveDraft } from './draft.ts'
import { validateBill, type Bill } from './model.ts'
import { computeSplit } from './split.ts'
import { useBill } from './useBill.ts'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

const bill = (): Bill => ({
  ...createBill(['p1', 'p2', 'i1']),
  tip: { kind: 'percent', ratio: { numerator: 10, denominator: 1 } },
  tipMode: 'equal',
})

function store(value: unknown): void {
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(value))
}

/** A saved draft with one change applied to its bill. */
function storeWith(change: (raw: Record<string, unknown>) => void): void {
  const raw = JSON.parse(JSON.stringify(bill())) as Record<string, unknown>
  change(raw)
  store({ version: 1, bill: raw })
}

describe('draft', () => {
  it('round-trips a bill', () => {
    saveDraft(bill())

    expect(loadDraft()).toEqual(bill())
  })

  it('is null with nothing saved', () => {
    expect(loadDraft()).toBeNull()
  })

  it.each([0, 2, '1', undefined])('drops version %j', (version) => {
    store({ version, bill: bill() })

    expect(loadDraft()).toBeNull()
  })

  it('drops bad JSON', () => {
    localStorage.setItem(DRAFT_STORAGE_KEY, '{"version":1,')

    expect(loadDraft()).toBeNull()
  })

  it.each<[string, (raw: Record<string, unknown>) => void]>([
    ['a missing field', (raw) => delete raw.tipMode],
    [
      'a string where a number is expected',
      (raw) => {
        raw.items = [{ ...(raw.items as object[])[0], unitPrice: '12,50' }]
      },
    ],
    [
      'an unknown adjustment kind',
      (raw) => (raw.tax = { kind: 'fixed', value: 1 }),
    ],
    ['an unknown mode', (raw) => (raw.taxMode = 'split')],
    ['people that is not a list', (raw) => (raw.people = {})],
    ['a person without a name', (raw) => (raw.people = [{ id: 'p1' }])],
  ])('drops a malformed shape: %s', (_, change) => {
    storeWith(change)

    expect(loadDraft()).toBeNull()
  })

  it.each<[string, (raw: Record<string, unknown>) => void]>([
    [
      'an unknown assignee id',
      (raw) => {
        raw.items = [
          {
            ...(raw.items as object[])[0],
            assignees: [{ personId: 'ghost', weight: 1 }],
          },
        ]
      },
    ],
    [
      'a duplicate person id',
      (raw) => {
        raw.people = [
          { id: 'p1', name: '' },
          { id: 'p1', name: '' },
        ]
      },
    ],
    ['a payer who is not a person', (raw) => (raw.payerId = 'ghost')],
  ])('drops bad references: %s', (_, change) => {
    storeWith(change)

    expect(loadDraft()).toBeNull()
  })

  it('keeps only known fields', () => {
    storeWith((raw) => {
      raw.extra = 'ignored'
    })

    expect(loadDraft()).toEqual(bill())
  })

  it.each<[string, (raw: Record<string, unknown>) => void, string]>([
    [
      'a share weight of 0',
      (raw) => {
        raw.items = [
          {
            ...(raw.items as object[])[0],
            assignees: [{ personId: 'p1', weight: 0 }],
          },
        ]
      },
      'shareOutOfRange',
    ],
    [
      'a price of 1.5 cents',
      (raw) => {
        raw.items = [{ ...(raw.items as object[])[0], unitPrice: 1.5 }]
      },
      'amountOutOfRange',
    ],
  ])('loads %s as an editable bill with its error', (_, change, code) => {
    storeWith(change)

    const loaded = loadDraft()
    expect(loaded).not.toBeNull()
    if (loaded === null) return
    expect(validateBill(loaded).map((error) => error.code)).toEqual([code])
    expect(() => computeSplit(loaded)).not.toThrow()
  })

  it('treats throwing storage as no draft, and saving as a no-op', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })

    expect(loadDraft()).toBeNull()
    expect(() => {
      saveDraft(bill())
    }).not.toThrow()
  })
})

describe('useBill', () => {
  it('starts a fresh bill with nothing saved, and saves it', () => {
    const { result } = renderHook(() => useBill())
    const [current] = result.current

    expect(current.people).toHaveLength(2)
    expect(current.items).toHaveLength(1)
    expect(loadDraft()).toEqual(current)
  })

  it('loads the saved draft', () => {
    saveDraft(bill())

    const { result } = renderHook(() => useBill())

    expect(result.current[0]).toEqual(bill())
  })

  it('saves every change', () => {
    const { result } = renderHook(() => useBill())

    act(() => {
      result.current[1]({
        type: 'renamePerson',
        personId: result.current[0].people[0]?.id ?? '',
        name: 'Ana',
      })
    })

    expect(loadDraft()?.people[0]?.name).toBe('Ana')
  })

  it('newBill replaces the saved draft with a fresh bill', () => {
    saveDraft(bill())
    const { result } = renderHook(() => useBill())

    act(() => {
      result.current[1]({ type: 'newBill', ids: ['q1', 'q2', 'j1'] })
    })

    expect(loadDraft()).toEqual(createBill(['q1', 'q2', 'j1']))
  })

  it('starts fresh when storage throws, without crashing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })

    const { result } = renderHook(() => useBill())

    expect(result.current[0].items).toHaveLength(1)
  })
})
