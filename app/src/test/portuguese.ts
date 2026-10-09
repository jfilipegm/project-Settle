/**
 * The English sentinels the Portuguese rendering tests look for (M3 plan,
 * S11, layer 3), shared by every suite that renders in Portuguese.
 */

/**
 * English that must never show in the Portuguese interface: words and
 * phrases from every page, and the lone words the literal-text guard can't
 * see ('less', 'more', 'was', 'were', 'items', 'each').
 */
export const ENGLISH_SENTINELS = [
  'Split',
  'Settle up',
  'Settings',
  'People',
  'Person',
  'Items',
  'Item',
  'Receipt',
  'receipt',
  'Add',
  'Remove',
  'Who',
  'owes',
  'Tax',
  'Tip',
  'Discount',
  'Amount',
  'Percentage',
  'Choose',
  'photo',
  'Theme',
  'Language',
  'Region',
  'Currency',
  'Example',
  'About',
  'Home',
  'Page',
  'Skip',
  'Copy',
  'Coming',
  'Finances',
  'Check',
  'Lines',
  'Matches',
  'Cancel',
  'Dismiss',
  'Enter',
  'the',
  'and',
  'less',
  'more',
  'was',
  'were',
  'items',
  'each',
  'this',
  'your',
  // M4: households, members and expenses.
  'Household',
  'Households',
  'Members',
  'Expenses',
  'Overview',
  'Rename',
  'Delete',
  'Archive',
  'Restore',
  'Joined',
  'Save',
]

/** The English sentinels found in a text, as whole words. */
export function english(text: string): string[] {
  return ENGLISH_SENTINELS.filter((word) =>
    new RegExp(`(^|[^\\p{L}])${word}($|[^\\p{L}])`, 'u').test(text),
  )
}

/** Everything a person can see or hear on the page. */
export function shownText(container: HTMLElement): string {
  const attributes = [
    ...container.querySelectorAll('[aria-label],[alt],[placeholder],[title]'),
  ].flatMap((element) =>
    ['aria-label', 'alt', 'placeholder', 'title'].map(
      (name) => element.getAttribute(name) ?? '',
    ),
  )
  // The wordmark is a name, the same in every language.
  return [container.textContent ?? '', ...attributes]
    .join('\n')
    .replace(/\bSettle\b(?! up)/g, '')
}
