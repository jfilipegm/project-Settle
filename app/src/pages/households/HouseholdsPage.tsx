import { IconPlus, IconTrash } from '@tabler/icons-react'
import { useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  requestPersistentStorage,
  writeHouseholdPointer,
} from '../../data/pointer.ts'
import {
  createHousehold,
  listHouseholds,
  listMembers,
  setHouseholdArchived,
} from '../../data/repository.ts'
import { newId } from '../../features/split/billReducer.ts'
import {
  useHouseholdData,
  useLoaded,
} from '../../features/household/householdData.ts'
import { nameError } from '../../features/household/forms.ts'
import {
  HOUSEHOLD_LIMITS,
  RECORD_VERSION,
  isActiveOn,
  isoDate,
  type Household,
  type Member,
} from '../../features/household/model.ts'
import { useT } from '../../i18n/language.ts'
import { Button, IconButton } from '../../ui/Button.tsx'
import { Card } from '../../ui/Card.tsx'
import { Dialog } from '../../ui/Dialog.tsx'
import { TextField } from '../../ui/Field.tsx'
import styles from './households.module.css'
import { StorageState } from './StorageState.tsx'

interface Row {
  household: Household
  people: number
}

async function loadRows(db: IDBDatabase, today: string) {
  const { items, unreadable } = await listHouseholds(db)
  const rows: Row[] = []
  for (const household of items) {
    const members = await listMembers(db, household.id)
    rows.push({
      household,
      people: members.items.filter((m) => isActiveOn(m, today)).length,
    })
  }
  rows.sort((a, b) => a.household.name.localeCompare(b.household.name))
  return { rows, unreadable }
}

/** The households on this device (M4 plan, H9): open, create, restore. */
export function HouseholdsPage() {
  const t = useT()
  const { status, db, changed } = useHouseholdData()
  const today = isoDate(new Date())
  const loaded = useLoaded(useCallback((d) => loadRows(d, today), [today]))
  const [creating, setCreating] = useState(false)

  const active =
    loaded.state === 'ready'
      ? loaded.value.rows.filter(
          (row) => row.household.archivedAt === undefined,
        )
      : []
  const archived =
    loaded.state === 'ready'
      ? loaded.value.rows.filter(
          (row) => row.household.archivedAt !== undefined,
        )
      : []

  return (
    <div className={styles.page}>
      <h1>{t('households.title')}</h1>
      <StorageState status={status} />
      {loaded.state === 'ready' && (
        <>
          <p className={styles.intro}>{t('households.intro')}</p>
          {active.length === 0 ? (
            <Card title={t('households.empty')}>
              <p className={styles.hint}>{t('households.emptyHint')}</p>
            </Card>
          ) : (
            <Card>
              <ul className={styles.list}>
                {active.map(({ household, people }) => (
                  <li key={household.id} className={styles.row}>
                    <span className={styles.rowMain}>
                      <Link
                        className={styles.rowLink}
                        to={`/households/${household.id}`}
                      >
                        {household.name}
                      </Link>
                      <span className={styles.rowMeta}>
                        {t('households.memberCount', { count: people })}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <p>
            <Button
              variant="primary"
              size={48}
              icon={IconPlus}
              onClick={() => setCreating(true)}
            >
              {t('households.new')}
            </Button>
          </p>
          {loaded.value.unreadable > 0 && (
            <p className={styles.hint}>
              {t('households.unreadable', { count: loaded.value.unreadable })}
            </p>
          )}
          {archived.length > 0 && (
            <Card title={t('households.archived')}>
              <ul className={styles.list}>
                {archived.map(({ household }) => (
                  <li key={household.id} className={styles.row}>
                    <span className={styles.rowMain}>
                      <span className={styles.rowTitle}>{household.name}</span>
                    </span>
                    <Button
                      size={40}
                      aria-label={t('households.restoreFor', {
                        name: household.name,
                      })}
                      onClick={() => {
                        if (db === null) return
                        const now = new Date().toISOString()
                        void setHouseholdArchived(db, household.id, null, now)
                          .then(changed)
                          .catch(() => undefined)
                      }}
                    >
                      {t('households.restore')}
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
      <NewHouseholdDialog
        open={creating}
        db={db}
        today={today}
        onClose={() => setCreating(false)}
        onCreated={() => {
          changed()
        }}
      />
    </div>
  )
}

/** "New household": a name, then the people to add (CP2). */
function NewHouseholdDialog({
  open,
  db,
  today,
  onClose,
  onCreated,
}: {
  open: boolean
  db: IDBDatabase | null
  today: string
  onClose: () => void
  onCreated: () => void
}) {
  const t = useT()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [people, setPeople] = useState<string[]>([''])
  const [submitted, setSubmitted] = useState(false)
  const [failed, setFailed] = useState(false)
  // A create in progress: a second press is ignored (one household).
  const [saving, setSaving] = useState(false)

  const close = () => {
    setName('')
    setPeople([''])
    setSubmitted(false)
    setFailed(false)
    onClose()
  }

  const named = people.map((person) => person.trim()).filter(Boolean)
  const householdError = nameError(t, name)
  const personErrors = people.map((person) =>
    person.trim() === '' ? undefined : nameError(t, person),
  )
  const tooMany = named.length > HOUSEHOLD_LIMITS.maxActiveMembers
  const valid =
    householdError === undefined &&
    personErrors.every((error) => error === undefined) &&
    !tooMany

  const submit = () => {
    if (saving) return
    setSubmitted(true)
    if (!valid || db === null) return
    setSaving(true)
    const now = new Date().toISOString()
    const id = newId()
    const household: Household = {
      v: RECORD_VERSION,
      id,
      name: name.trim(),
      createdAt: now,
      updatedAt: now,
    }
    const members = named.map((personName, position): Member => ({
      v: RECORD_VERSION,
      id: newId(),
      householdId: id,
      name: personName,
      position,
      joinedOn: today,
    }))
    createHousehold(db, household, members).then(
      () => {
        requestPersistentStorage()
        writeHouseholdPointer(id)
        setSaving(false)
        onCreated()
        close()
        void navigate(`/households/${id}`)
      },
      () => {
        setSaving(false)
        setFailed(true)
      },
    )
  }

  return (
    <Dialog open={open} title={t('households.new')} onClose={close}>
      <form
        className={styles.form}
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <TextField
          label={t('households.create.name')}
          hint={t('households.create.nameHint')}
          value={name}
          maxLength={HOUSEHOLD_LIMITS.maxNameLength}
          error={submitted ? householdError : undefined}
          onChange={(event) => setName(event.target.value)}
        />
        <fieldset className={styles.form}>
          <legend>{t('households.create.people')}</legend>
          <p className={styles.hint}>{t('households.create.peopleHint')}</p>
          {people.map((person, index) => (
            <div key={index} className={styles.formRow}>
              <TextField
                label={t('households.create.person', { n: index + 1 })}
                value={person}
                maxLength={HOUSEHOLD_LIMITS.maxNameLength}
                error={submitted ? personErrors[index] : undefined}
                onChange={(event) => {
                  const next = [...people]
                  next[index] = event.target.value
                  setPeople(next)
                }}
              />
              {people.length > 1 && (
                <IconButton
                  icon={IconTrash}
                  variant="quiet"
                  label={t('households.create.removePerson', { n: index + 1 })}
                  onClick={() =>
                    setPeople(people.filter((_, other) => other !== index))
                  }
                />
              )}
            </div>
          ))}
          {tooMany && submitted && (
            <p className={styles.error} role="alert">
              {t('households.errors.tooManyPeople')}
            </p>
          )}
          <p>
            <Button
              variant="quiet"
              icon={IconPlus}
              onClick={() => setPeople([...people, ''])}
            >
              {t('households.create.addPerson')}
            </Button>
          </p>
        </fieldset>
        {failed && (
          <p className={styles.error} role="alert">
            {t('households.errors.saveFailed')}
          </p>
        )}
        <div className={styles.formActions}>
          <Button onClick={close}>{t('households.cancel')}</Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {t('households.create.submit')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
