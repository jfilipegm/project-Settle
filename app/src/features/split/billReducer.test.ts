import { describe, expect, it } from 'vitest'
import { cents } from '../../lib/money.ts'
import { billReducer, createBill, type BillAction } from './billReducer.ts'
import { validateBill, type Bill } from './model.ts'

function run(bill: Bill, ...actions: BillAction[]): Bill {
  return actions.reduce(billReducer, bill)
}

const fresh = () => createBill(['p1', 'p2', 'i1'])

function assigneesOf(bill: Bill, itemId: string) {
  return bill.items.find((item) => item.id === itemId)?.assignees
}

describe('createBill', () => {
  it('starts with two people and one empty item assigned to both', () => {
    const bill = fresh()

    expect(bill.people).toEqual([
      { id: 'p1', name: '' },
      { id: 'p2', name: '' },
    ])
    expect(bill.items).toEqual([
      {
        id: 'i1',
        name: '',
        quantity: { numerator: 1, denominator: 1 },
        unitPrice: 0,
        assignees: [
          { personId: 'p1', weight: 1 },
          { personId: 'p2', weight: 1 },
        ],
      },
    ])
    expect(bill.payerId).toBe('p1')
  })

  it('is valid, so a fresh bill shows a result rather than an error', () => {
    expect(validateBill(fresh())).toEqual([])
  })
})

describe('items', () => {
  it('adds an item assigned to everyone', () => {
    const bill = run(
      fresh(),
      { type: 'setPeopleCount', count: 3, ids: ['p3'] },
      { type: 'addItem', id: 'i2' },
    )

    expect(bill.items.map((item) => item.id)).toEqual(['i1', 'i2'])
    expect(assigneesOf(bill, 'i2')).toEqual([
      { personId: 'p1', weight: 1 },
      { personId: 'p2', weight: 1 },
      { personId: 'p3', weight: 1 },
    ])
  })

  it('updates only the named item', () => {
    const bill = run(
      fresh(),
      { type: 'addItem', id: 'i2' },
      {
        type: 'updateItem',
        itemId: 'i2',
        changes: {
          name: 'Wine',
          unitPrice: cents(1450),
          quantity: { numerator: 2, denominator: 1 },
        },
      },
    )

    expect(bill.items[0]?.name).toBe('')
    expect(bill.items[1]).toMatchObject({
      name: 'Wine',
      unitPrice: 1450,
      quantity: { numerator: 2, denominator: 1 },
    })
  })

  it('removes an item', () => {
    const bill = run(
      fresh(),
      { type: 'addItem', id: 'i2' },
      { type: 'removeItem', itemId: 'i1' },
    )

    expect(bill.items.map((item) => item.id)).toEqual(['i2'])
  })

  it('stops adding items at 100', () => {
    const actions: BillAction[] = Array.from({ length: 105 }, (_, i) => ({
      type: 'addItem',
      id: `x${i}`,
    }))

    expect(run(fresh(), ...actions).items).toHaveLength(100)
  })
})

describe('people', () => {
  it('adds unnamed people up to the count, and removes them from the end', () => {
    let bill = run(fresh(), {
      type: 'setPeopleCount',
      count: 4,
      ids: ['p3', 'p4', 'unused'],
    })
    expect(bill.people.map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'p4'])
    expect(bill.people[3]?.name).toBe('')

    bill = run(bill, { type: 'setPeopleCount', count: 2, ids: [] })
    expect(bill.people.map((p) => p.id)).toEqual(['p1', 'p2'])
  })

  it('clamps the count to 1–20', () => {
    const ids = Array.from({ length: 30 }, (_, i) => `n${i}`)

    expect(
      run(fresh(), { type: 'setPeopleCount', count: 25, ids }).people,
    ).toHaveLength(20)
    expect(
      run(fresh(), { type: 'setPeopleCount', count: 0, ids }).people,
    ).toHaveLength(1)
  })

  it('down to 1 drops the removed people from items and the payer', () => {
    const bill = run(
      fresh(),
      { type: 'setPayer', personId: 'p2' },
      { type: 'setPeopleCount', count: 1, ids: [] },
    )

    expect(bill.people.map((p) => p.id)).toEqual(['p1'])
    expect(assigneesOf(bill, 'i1')).toEqual([{ personId: 'p1', weight: 1 }])
    expect(bill.payerId).toBe('p1')
  })

  it('renames a person', () => {
    const bill = run(fresh(), {
      type: 'renamePerson',
      personId: 'p2',
      name: 'Rui',
    })

    expect(bill.people[1]).toEqual({ id: 'p2', name: 'Rui' })
  })

  it('removing the payer moves the payer to the first remaining person', () => {
    const bill = run(
      fresh(),
      { type: 'setPeopleCount', count: 3, ids: ['p3'] },
      { type: 'removePerson', personId: 'p1' },
    )

    expect(bill.people.map((p) => p.id)).toEqual(['p2', 'p3'])
    expect(bill.payerId).toBe('p2')
    expect(assigneesOf(bill, 'i1')).toEqual([{ personId: 'p2', weight: 1 }])
  })

  it('never removes the last person', () => {
    const one = run(fresh(), { type: 'removePerson', personId: 'p2' })

    expect(run(one, { type: 'removePerson', personId: 'p1' }).people).toEqual([
      { id: 'p1', name: '' },
    ])
  })
})

describe('assignment', () => {
  it('removing the last assignee leaves the item unassigned, which validateBill reports', () => {
    const bill = run(
      fresh(),
      { type: 'toggleAssignee', itemId: 'i1', personId: 'p1' },
      { type: 'toggleAssignee', itemId: 'i1', personId: 'p2' },
    )

    expect(assigneesOf(bill, 'i1')).toEqual([])
    expect(validateBill(bill)).toEqual([
      {
        code: 'unassignedItem',
        field: { kind: 'item', itemId: 'i1', part: 'assignees' },
      },
    ])
  })

  it('toggling back keeps assignees in people order, with weight 1', () => {
    const bill = run(
      fresh(),
      { type: 'setShare', itemId: 'i1', personId: 'p2', weight: 3 },
      { type: 'toggleAssignee', itemId: 'i1', personId: 'p1' },
      { type: 'toggleAssignee', itemId: 'i1', personId: 'p1' },
    )

    expect(assigneesOf(bill, 'i1')).toEqual([
      { personId: 'p1', weight: 1 },
      { personId: 'p2', weight: 3 },
    ])
  })

  it('sets a share weight', () => {
    const bill = run(fresh(), {
      type: 'setShare',
      itemId: 'i1',
      personId: 'p1',
      weight: 2,
    })

    expect(assigneesOf(bill, 'i1')).toEqual([
      { personId: 'p1', weight: 2 },
      { personId: 'p2', weight: 1 },
    ])
  })
})

describe('bill-level actions', () => {
  it('sets adjustments and their modes', () => {
    const bill = run(
      fresh(),
      {
        type: 'setAdjustment',
        name: 'tip',
        adjustment: {
          kind: 'percent',
          ratio: { numerator: 10, denominator: 1 },
        },
      },
      { type: 'setAdjustmentMode', name: 'tip', mode: 'equal' },
      { type: 'setAdjustmentMode', name: 'tax', mode: 'equal' },
      {
        type: 'setAdjustment',
        name: 'discount',
        adjustment: { kind: 'amount', value: cents(500) },
      },
    )

    expect(bill.tip).toEqual({
      kind: 'percent',
      ratio: { numerator: 10, denominator: 1 },
    })
    expect(bill.tipMode).toBe('equal')
    expect(bill.taxMode).toBe('equal')
    expect(bill.discount).toEqual({ kind: 'amount', value: 500 })
  })

  it('sets the payer, ignoring an unknown person', () => {
    const bill = run(fresh(), { type: 'setPayer', personId: 'p2' })

    expect(bill.payerId).toBe('p2')
    expect(run(bill, { type: 'setPayer', personId: 'nobody' }).payerId).toBe(
      'p2',
    )
  })

  it('newBill starts over with the given ids', () => {
    const bill = run(
      fresh(),
      { type: 'addItem', id: 'i2' },
      { type: 'newBill', ids: ['q1', 'q2', 'j1'] },
    )

    expect(bill).toEqual(createBill(['q1', 'q2', 'j1']))
  })

  it('replaceBill puts a whole bill in place', () => {
    const imported = { ...createBill(['a', 'b', 'c']), payerId: 'b' }

    expect(run(fresh(), { type: 'replaceBill', bill: imported })).toBe(imported)
  })
})
