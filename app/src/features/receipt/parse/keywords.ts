/**
 * Parsing rule 3's keyword tables, folded (lowercase, no accents) and
 * written as the words a line splits into: punctuation outside amounts and
 * dates separates words, so `c/` is the word `c` and `sub-total` is
 * `sub total`. Every phrase matches whole words only, so `tax` never
 * matches `taxa` and `total` never matches inside `subtotal`.
 */

/** Payment and footer lines. */
export const IGNORE = [
  'pago com cartao',
  'cartao de credito',
  'cartao de debito',
  'processado por programa',
  'capital social',
  'card payment',
  'credit card',
  'debit card',
  'thank you',
  'mb way',
  'multibanco',
  'mastercard',
  'numerario',
  'dinheiro',
  'entregue',
  'tendered',
  'pagamento',
  'payment',
  'obrigado',
  'change',
  'troco',
  'atcud',
  'visa',
  'cash',
  'pago',
  'paid',
  'rueckgeld',
  'ruckgeld',
  'zuruck',
  'gegeben',
  'contanti',
  'contante',
  'pagato',
] as const

/** Words that make a line a payment line (manual review M-O-2). */
export const PAYMENT_WORDS = [
  'mb way',
  'multibanco',
  'mastercard',
  'numerario',
  'dinheiro',
  'entregue',
  'tendered',
  'pagamento',
  'payment',
  'change',
  'troco',
  'visa',
  'cash',
  'pago',
  'paid',
  'rueckgeld',
  'ruckgeld',
  'zuruck',
  'gegeben',
  'contanti',
  'contante',
  'pagato',
] as const

/** Card payment phrases: also payment lines. */
export const CARD_PAYMENT = [
  'pago com cartao',
  'cartao de credito',
  'cartao de debito',
  'card payment',
  'credit card',
  'debit card',
] as const

/** A whole description of just one of these is a payment line. */
export const CARD_ALONE = ['card', 'cartao'] as const

export const TAX_SUMMARY = [
  'total iva',
  'iva total',
  'total vat',
  'vat total',
  'total tax',
  'tax total',
] as const

/** An "included" qualifier turns a tax summary into a total (R3-I-2). */
export const INCLUDED = [
  'incluido',
  'incluida',
  'incluidos',
  'incluidas',
  'incl',
  'inc',
  'c',
  'com',
  'included',
  'including',
] as const

export const SAVINGS_SUMMARY = [
  'total de descontos',
  'total poupancas',
  'total poupanca',
  'poupanca total',
  'total descontos',
  'total desconto',
  'total savings',
  'you saved',
] as const

export const SUBTOTAL = [
  'total excluding vat',
  'total before tax',
  'total excl vat',
  'total ex vat',
  'total iliquido',
  'total sem iva',
  'total s iva',
  'total net',
  'net total',
  'sub total',
  'subtotal',
  'zwischensumme',
  'subtotale',
] as const

export const TOTAL = [
  'total including vat',
  'total incl vat',
  'total inc vat',
  'total do documento',
  'total a pagar',
  'total com iva',
  'total c iva',
  'balance due',
  'amount due',
  'total due',
  'total eur',
  'a pagar',
  'total',
  'gesamtsumme',
  'zu zahlen',
  'summe',
  'totale',
] as const

/** Rule 8: a later total with one of these replaces a plainer one. */
export const SPECIFIC_TOTAL = [
  'total including vat',
  'total incl vat',
  'total inc vat',
  'total a pagar',
  'total com iva',
  'total c iva',
  'balance due',
  'amount due',
  'total due',
] as const

export const TIP = [
  'taxa de servico',
  'service charge',
  'gratuity',
  'servico',
  'service',
  'tip',
] as const

/** Rule 8: a tip line with one of these is only a suggestion. */
export const SUGGESTED = [
  'suggested',
  'sugestao',
  'sugerida',
  'sugerido',
] as const

export const TAX = ['sales tax', 'iva', 'vat', 'tax'] as const

/** Words a tax-table line may carry besides rates and tax codes. */
export const TAX_TABLE_WORDS = [
  'iva',
  'vat',
  'tax',
  'taxa',
  'rate',
  'base',
  'mwst',
  'ust',
] as const

/**
 * R18: a tax table's column titles (`Taxa Base Inc. Val.Total Val. IVA`,
 * `%IVA Total Liq. IVA Total`). Two of them on a line with no amount,
 * after an item, is the table's header, and it ends the items.
 */
export const TAX_COLUMN_WORDS = [
  'taxa',
  'base',
  'inc',
  'iva',
  'liq',
  'valor',
  'val',
  'total',
  'mwst',
  'netto',
  'brutto',
  'steuer',
] as const

export const DISCOUNT = [
  'descontos',
  'desconto',
  'poupancas',
  'poupanca',
  'promocao',
  'discount',
  'savings',
  'saving',
  'promo',
  'desc',
] as const

/** Rule 5: header lines that are a document title, never the merchant. */
export const DOCUMENT_TITLE = [
  'fatura simplificada',
  'fatura recibo',
  'fatura',
  'factura',
  'recibo',
  'receipt',
  'invoice',
] as const

/** Rule 6: a quantity column title in the header. */
export const QUANTITY_TITLE = ['qtd', 'quant', 'qty'] as const

/** Rule 5: lines that hold a fact, never the merchant's name. */
export const NOT_MERCHANT = [
  'contribuinte',
  'telefone',
  'nif',
  'tel',
  'telf',
  'tlf',
  'tlm',
  'phone',
  'vat',
  'data',
  'date',
  'hora',
  'time',
  'www',
] as const

/**
 * Where `phrase` starts in `words` as consecutive whole words, or -1.
 */
export function findPhrase(words: readonly string[], phrase: string): number {
  const parts = phrase.split(' ')
  for (let i = 0; i + parts.length <= words.length; i++) {
    if (parts.every((part, j) => words[i + j] === part)) {
      return i
    }
  }
  return -1
}

/** Whether any phrase of `table` is in `words`. */
export function hasPhrase(
  words: readonly string[],
  table: readonly string[],
): boolean {
  return table.some((phrase) => findPhrase(words, phrase) !== -1)
}

/** Whether a phrase of `table` starts `words`. */
export function startsWithPhrase(
  words: readonly string[],
  table: readonly string[],
): boolean {
  return table.some((phrase) => findPhrase(words, phrase) === 0)
}
