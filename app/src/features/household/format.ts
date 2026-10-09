import type { Language } from '../../i18n/t.ts'
import type { MoneyLocale } from '../../lib/money.ts'

/**
 * The locale for dates with month names (M4 plan, H15): they follow the
 * language, and in English the Region's English locale (en-GB or en-US),
 * else en-GB.
 */
export function dateLocale(language: Language, region: MoneyLocale): string {
  if (language === 'pt') return 'pt-PT'
  return region === 'en-US' ? 'en-US' : 'en-GB'
}

function utcDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1))
}

/** A `YYYY-MM-DD` date: "14 Oct 2026" (or the locale's own order). */
export function formatDate(
  iso: string,
  locale: string,
  options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  },
): string {
  return new Intl.DateTimeFormat(locale, {
    ...options,
    timeZone: 'UTC',
  }).format(utcDate(iso))
}

/** A `YYYY-MM` month: "October 2026", or "outubro de 2026". */
export function formatMonth(month: string, locale: string): string {
  return formatDate(`${month}-01`, locale, { month: 'long', year: 'numeric' })
}
