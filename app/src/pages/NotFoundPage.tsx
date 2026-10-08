import { Link } from 'react-router'
import { useT } from '../i18n/language.ts'

export function NotFoundPage() {
  const t = useT()
  return (
    <>
      <h1>{t('notFound.title')}</h1>
      <p>{t('notFound.body')}</p>
      <p>
        <Link to="/">{t('notFound.home')}</Link>
      </p>
    </>
  )
}
