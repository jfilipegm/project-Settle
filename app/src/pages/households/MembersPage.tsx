import { IconUserPlus } from '@tabler/icons-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useRegion } from '../../app/region.ts'
import { writeHouseholdPointer } from '../../data/pointer.ts'
import {
  MemberInUseError,
  MemberLimitError,
  addMember,
  deleteMember,
  renameHousehold,
  renameMember,
  setHouseholdArchived,
  setMemberLeft,
} from '../../data/repository.ts'
import { useHouseholdData } from '../../features/household/householdData.ts'
import { dateLocale, formatDate } from '../../features/household/format.ts'
import { nameError } from '../../features/household/forms.ts'
import {
  HOUSEHOLD_LIMITS,
  RECORD_VERSION,
  isActiveOn,
  isIsoDate,
  isoDate,
  type Member,
} from '../../features/household/model.ts'
import { newId } from '../../features/split/billReducer.ts'
import { useLanguage } from '../../i18n/language.ts'
import { Button } from '../../ui/Button.tsx'
import { Card } from '../../ui/Card.tsx'
import { Dialog } from '../../ui/Dialog.tsx'
import { TextField } from '../../ui/Field.tsx'
import { PersonBadge } from '../../ui/PersonBadge.tsx'
import { useHouseholdContext } from './householdContext.ts'
import styles from './households.module.css'

type Editing =
  | { kind: 'rename'; member: Member }
  | { kind: 'leave'; member: Member }
  | { kind: 'delete'; member: Member }
  | { kind: 'renameHousehold' }
  | { kind: 'archive' }
  | null

/**
 * A household's members (M4 plan, H7): who is in it, who has left, adding
 * someone, and the household's own name and archive.
 */
export function MembersPage() {
  const { t, language } = useLanguage()
  const { region } = useRegion()
  const { db, changed } = useHouseholdData()
  const { household, members, unreadableMembers } = useHouseholdContext()
  const navigate = useNavigate()
  const today = isoDate(new Date())
  const locale = dateLocale(language, region.locale)
  const [editing, setEditing] = useState<Editing>(null)
  const [notice, setNotice] = useState<string>()

  const current = members.filter((m) => m.leftOn === undefined)
  const left = members.filter((m) => m.leftOn !== undefined)
  const date = (iso: string) => formatDate(iso, locale)

  const run = (action: Promise<unknown>) => {
    setNotice(undefined)
    void action.then(
      () => {
        setEditing(null)
        changed()
      },
      (error: unknown) => {
        setEditing(null)
        setNotice(
          error instanceof MemberInUseError
            ? error.reason === 'unreadable'
              ? t('members.unreadable')
              : t('members.inUse', {
                  name:
                    editing !== null && 'member' in editing
                      ? editing.member.name
                      : '',
                })
            : error instanceof MemberLimitError
              ? t('members.errors.limit')
              : t('households.errors.saveFailed'),
        )
      },
    )
  }

  const row = (member: Member) => (
    <li key={member.id} className={styles.row}>
      <span className={styles.rowMain}>
        <PersonBadge person={member} index={member.position} />
        <span className={styles.rowMeta}>
          {member.leftOn === undefined
            ? t('members.joined', { date: date(member.joinedOn) })
            : t('members.leftOn', { date: date(member.leftOn) })}
        </span>
      </span>
      <span className={styles.actions}>
        <Button
          size={40}
          variant="quiet"
          aria-label={t('members.renameFor', { name: member.name })}
          onClick={() => setEditing({ kind: 'rename', member })}
        >
          {t('members.rename')}
        </Button>
        {member.leftOn === undefined ? (
          <Button
            size={40}
            variant="quiet"
            aria-label={t('members.markLeftFor', { name: member.name })}
            onClick={() => setEditing({ kind: 'leave', member })}
          >
            {t('members.markLeft')}
          </Button>
        ) : (
          <Button
            size={40}
            variant="quiet"
            aria-label={t('members.undoLeavingFor', { name: member.name })}
            onClick={() => {
              if (db !== null) {
                run(setMemberLeft(db, household.id, member.id, null))
              }
            }}
          >
            {t('members.undoLeaving')}
          </Button>
        )}
        <Button
          size={40}
          variant="quiet"
          aria-label={t('members.deleteFor', { name: member.name })}
          onClick={() => setEditing({ kind: 'delete', member })}
        >
          {t('members.delete')}
        </Button>
      </span>
    </li>
  )

  return (
    <>
      <h1>{t('members.title')}</h1>
      {notice !== undefined && (
        <Card role="alert">
          <p>{notice}</p>
        </Card>
      )}
      <Card>
        {current.length === 0 ? (
          <p className={styles.hint}>{t('overview.noMembers')}</p>
        ) : (
          <ul className={styles.list}>{current.map(row)}</ul>
        )}
      </Card>

      <AddMemberCard
        today={today}
        onAdd={(name, joinedOn) => {
          if (db === null) return
          run(
            addMember(
              db,
              {
                v: RECORD_VERSION,
                id: newId(),
                householdId: household.id,
                name,
                joinedOn,
              },
              today,
            ),
          )
        }}
        full={
          members.filter((m) => isActiveOn(m, today)).length >=
          HOUSEHOLD_LIMITS.maxActiveMembers
        }
      />

      <Card title={t('members.left')}>
        {left.length === 0 ? (
          <p className={styles.hint}>{t('members.noneLeft')}</p>
        ) : (
          <ul className={styles.list}>{left.map(row)}</ul>
        )}
      </Card>

      {unreadableMembers > 0 && (
        <p className={styles.hint}>
          {t('members.unreadableCount', { count: unreadableMembers })}
        </p>
      )}

      <Card title={t('members.household.title')}>
        <div className={styles.actions}>
          <Button onClick={() => setEditing({ kind: 'renameHousehold' })}>
            {t('members.household.rename')}
          </Button>
          {household.archivedAt === undefined && (
            <Button onClick={() => setEditing({ kind: 'archive' })}>
              {t('members.household.archive')}
            </Button>
          )}
        </div>
      </Card>

      <NameDialog
        key={editing?.kind === 'rename' ? editing.member.id : 'rename'}
        open={editing?.kind === 'rename'}
        title={
          editing?.kind === 'rename'
            ? t('members.renameTitle', { name: editing.member.name })
            : ''
        }
        label={t('members.name')}
        initial={editing?.kind === 'rename' ? editing.member.name : ''}
        onClose={() => setEditing(null)}
        onSave={(name) => {
          if (db !== null && editing?.kind === 'rename') {
            run(renameMember(db, household.id, editing.member.id, name))
          }
        }}
      />

      <NameDialog
        key="household"
        open={editing?.kind === 'renameHousehold'}
        title={t('members.household.rename')}
        label={t('households.create.name')}
        initial={household.name}
        onClose={() => setEditing(null)}
        onSave={(name) => {
          if (db !== null) {
            run(
              renameHousehold(db, household.id, name, new Date().toISOString()),
            )
          }
        }}
      />

      <LeaveDialog
        key={editing?.kind === 'leave' ? editing.member.id : 'leave'}
        member={editing?.kind === 'leave' ? editing.member : null}
        today={today}
        onClose={() => setEditing(null)}
        onSave={(leftOn) => {
          if (db !== null && editing?.kind === 'leave') {
            run(setMemberLeft(db, household.id, editing.member.id, leftOn))
          }
        }}
      />

      <Dialog
        open={editing?.kind === 'delete'}
        title={
          editing?.kind === 'delete'
            ? t('members.deleteTitle', { name: editing.member.name })
            : ''
        }
        onClose={() => setEditing(null)}
      >
        {editing?.kind === 'delete' && (
          <div className={styles.form}>
            <p>{t('members.deleteBody', { name: editing.member.name })}</p>
            <div className={styles.formActions}>
              <Button onClick={() => setEditing(null)}>
                {t('households.cancel')}
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  if (db !== null) {
                    run(deleteMember(db, household.id, editing.member.id))
                  }
                }}
              >
                {t('members.delete')}
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog
        open={editing?.kind === 'archive'}
        title={t('members.household.archiveTitle', { name: household.name })}
        onClose={() => setEditing(null)}
      >
        <div className={styles.form}>
          <p>{t('members.household.archiveBody')}</p>
          <div className={styles.formActions}>
            <Button onClick={() => setEditing(null)}>
              {t('households.cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (db === null) return
                const now = new Date().toISOString()
                void setHouseholdArchived(db, household.id, now, now).then(
                  () => {
                    writeHouseholdPointer(null)
                    changed()
                    void navigate('/households')
                  },
                  () => setNotice(t('households.errors.saveFailed')),
                )
              }}
            >
              {t('members.household.archiveConfirm')}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  )
}

function AddMemberCard({
  today,
  full,
  onAdd,
}: {
  today: string
  full: boolean
  onAdd: (name: string, joinedOn: string) => void
}) {
  const { t } = useLanguage()
  const [name, setName] = useState('')
  const [joinedOn, setJoinedOn] = useState(today)
  const [submitted, setSubmitted] = useState(false)
  const error = nameError(t, name)
  const dateError = isIsoDate(joinedOn)
    ? undefined
    : t('members.errors.dateInvalid')
  return (
    <Card title={t('members.add.title')}>
      <form
        className={styles.form}
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          setSubmitted(true)
          if (error !== undefined || dateError !== undefined || full) return
          onAdd(name.trim(), joinedOn)
          setName('')
          setSubmitted(false)
        }}
      >
        <TextField
          label={t('members.add.name')}
          value={name}
          maxLength={HOUSEHOLD_LIMITS.maxNameLength}
          error={submitted ? error : undefined}
          onChange={(event) => setName(event.target.value)}
        />
        <TextField
          type="date"
          label={t('members.add.joinedOn')}
          value={joinedOn}
          error={submitted ? dateError : undefined}
          onChange={(event) => setJoinedOn(event.target.value)}
        />
        {full && (
          <p className={styles.hint} role="status">
            {t('members.errors.limit')}
          </p>
        )}
        <p>
          <Button type="submit" icon={IconUserPlus} disabled={full}>
            {t('members.add.submit')}
          </Button>
        </p>
      </form>
    </Card>
  )
}

function NameDialog({
  open,
  title,
  label,
  initial,
  onClose,
  onSave,
}: {
  open: boolean
  title: string
  label: string
  initial: string
  onClose: () => void
  onSave: (name: string) => void
}) {
  const { t } = useLanguage()
  const [name, setName] = useState(initial)
  const [submitted, setSubmitted] = useState(false)
  const error = nameError(t, name)
  return (
    <Dialog open={open} title={title} onClose={onClose}>
      <form
        className={styles.form}
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          setSubmitted(true)
          if (error === undefined) onSave(name.trim())
        }}
      >
        <TextField
          label={label}
          value={name}
          maxLength={HOUSEHOLD_LIMITS.maxNameLength}
          error={submitted ? error : undefined}
          onChange={(event) => setName(event.target.value)}
        />
        <div className={styles.formActions}>
          <Button onClick={onClose}>{t('households.cancel')}</Button>
          <Button type="submit" variant="primary">
            {t('households.save')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

function LeaveDialog({
  member,
  today,
  onClose,
  onSave,
}: {
  member: Member | null
  today: string
  onClose: () => void
  onSave: (leftOn: string) => void
}) {
  const { t } = useLanguage()
  const [leftOn, setLeftOn] = useState(today)
  const [submitted, setSubmitted] = useState(false)
  const error = !isIsoDate(leftOn)
    ? t('members.errors.dateInvalid')
    : member !== null && leftOn < member.joinedOn
      ? t('members.errors.leftBeforeJoined')
      : undefined
  return (
    <Dialog
      open={member !== null}
      title={
        member === null ? '' : t('members.markLeftTitle', { name: member.name })
      }
      onClose={onClose}
    >
      <form
        className={styles.form}
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          setSubmitted(true)
          if (error === undefined) onSave(leftOn)
        }}
      >
        <TextField
          type="date"
          label={t('members.leftDate')}
          hint={t('members.leftHint')}
          value={leftOn}
          error={submitted ? error : undefined}
          onChange={(event) => setLeftOn(event.target.value)}
        />
        <div className={styles.formActions}>
          <Button onClick={onClose}>{t('households.cancel')}</Button>
          <Button type="submit" variant="primary">
            {t('members.markLeft')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
