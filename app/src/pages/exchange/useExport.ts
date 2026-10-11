import { useCallback, useState } from 'react'
import { handOver } from '../../app/handOver.ts'
import {
  NothingToShareError,
  leftOutCount,
  type LeftOut,
  type Snapshot,
} from '../../data/exchange.ts'
import { useHouseholdData } from '../../features/household/householdData.ts'

/** A file to hand over, made from a snapshot. */
export interface Made {
  snapshot: Snapshot
  fileName: string
}

export type ExportState =
  | { kind: 'idle' }
  | { kind: 'working' }
  /** Records stay out: the user is told before the file is made (E1). */
  | { kind: 'confirm'; leftOut: LeftOut; made: Made }
  | { kind: 'done' }
  | { kind: 'nothing' }
  | { kind: 'failed' }

/**
 * Makes a Settle file and hands it over (M6 plan, E1, E7, E10): the
 * snapshot first; when records stay out, a confirmation that names them;
 * then the share sheet or a download. `after` runs once the file was
 * handed over without an error (a backup records itself there).
 */
export function useExport(
  make: (db: IDBDatabase) => Promise<Made>,
  after?: (db: IDBDatabase, made: Made) => Promise<void>,
) {
  const { db } = useHouseholdData()
  const [state, setState] = useState<ExportState>({ kind: 'idle' })

  const deliver = useCallback(
    async (made: Made) => {
      if (db === null) return
      const file = new File([made.snapshot.text], made.fileName, {
        type: 'application/json',
      })
      const result = await handOver(file)
      if (result === 'cancelled') {
        setState({ kind: 'idle' })
        return
      }
      await after?.(db, made)
      setState({ kind: 'done' })
    },
    [db, after],
  )

  const start = useCallback(() => {
    if (db === null) return
    setState({ kind: 'working' })
    make(db)
      .then(async (made) => {
        const { leftOut } = made.snapshot
        if (leftOutCount(leftOut) > 0) {
          setState({ kind: 'confirm', leftOut, made })
        } else {
          await deliver(made)
        }
      })
      .catch((error: unknown) => {
        setState({
          kind: error instanceof NothingToShareError ? 'nothing' : 'failed',
        })
      })
  }, [db, make, deliver])

  const confirm = useCallback(() => {
    if (state.kind !== 'confirm') return
    const { made } = state
    setState({ kind: 'working' })
    deliver(made).catch(() => {
      setState({ kind: 'failed' })
    })
  }, [state, deliver])

  const cancel = useCallback(() => {
    setState({ kind: 'idle' })
  }, [])

  return { state, start, confirm, cancel }
}
