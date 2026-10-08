import { useT } from '../i18n/language.ts'

interface PlaceholderPageProps {
  title: string
  /** What the page will do, in one sentence. */
  summary: string
  /** The roadmap milestone that builds the page, e.g. `M1`. */
  milestone: string
  /** That milestone's name in docs/ROADMAP.md. */
  milestoneName: string
}

/** A page that exists in the navigation but is built by a later milestone. */
export function PlaceholderPage({
  title,
  summary,
  milestone,
  milestoneName,
}: PlaceholderPageProps) {
  const t = useT()
  return (
    <>
      <h1>{title}</h1>
      <p>{summary}</p>
      <p>{t('placeholder.comingIn', { milestone, name: milestoneName })}</p>
    </>
  )
}
