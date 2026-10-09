import { Link } from 'react-router'
import { useT } from '../i18n/language.ts'
import { Card } from '../ui/Card.tsx'

export function NotFoundPage() {
  const t = useT()
  return (
    <>
      <h1>{t('notFound.title')}</h1>
      <Card>
        <p>{t('notFound.body')}</p>
        <p>
          <Link to="/">{t('notFound.home')}</Link>
        </p>
      </Card>
    </>
  )
}
