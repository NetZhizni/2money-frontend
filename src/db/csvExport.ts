import { useAllAccountsStore } from '../stores/allAccounts'
import { useProfilesStore } from '../stores/profiles'
import { useCategoriesStore } from '../stores/categories'
import { useTagsStore } from '../stores/tags'
import { useTransactionsStore } from '../stores/transactions'
import { useSettingsStore } from '../stores/settings'
import { useViewAsStore } from '../stores/viewAs'
import { resolveAccountLabel } from '../utils/accountLabel'
import { toCsv, CSV_BOM, type CsvCell } from '../utils/csv'
import { downloadFile } from '../utils/download'
import { dateKey, formatDate, getNumberFormatSetting } from '../utils/format'
import { resolveCategoryCurrency } from '../utils/currencies'
import {
  nativeSignedAmount,
  otherCurrencyAmount as resolveOtherCurrencyAmount,
  signedAmountInCurrency,
  type ToBase,
} from '../utils/transactionAmounts'
import { crossRate, resolveSnapshot, snapshotKey, type RateSnapshot } from './exchangeRates'
import { t, locale } from '../i18n'
import type { Transaction } from '../types/models'

// ";" + comma decimals opens correctly in Excel under a Ukrainian/European
// number format with no manual import step (that Excel treats "," as the
// list separator and "," inside a number as the decimal point); the US
// number format gets Excel's own default instead (",", period decimals) for
// the same no-manual-import reason — Google Sheets needs the delimiter
// picked manually on import either way, an acceptable trade-off here.
// Follows Settings → "Формат чисел" (see format.ts), falling back to the
// text language for 'auto' same as it did before that setting existed.
// Computed fresh on every export (not once at module load) so a language
// switch since the last export is picked up — `locale` is a live ref (see
// i18n/locale.ts), even though `numberFormatSetting` itself is still a
// plain reload-to-apply setting.
function csvNumberFormat(): { delimiter: string; decimalSeparator: string } {
  const numberFormatSetting = getNumberFormatSetting()
  const usesCommaDecimal = numberFormatSetting === 'auto' ? locale.value === 'uk' : numberFormatSetting === 'uk' || numberFormatSetting === 'eu'
  return usesCommaDecimal ? { delimiter: ';', decimalSeparator: ',' } : { delimiter: ',', decimalSeparator: '.' }
}

function typeLabel(type: Transaction['type']): string {
  return type === 'expense' ? t('categories.form.expenseType') : type === 'income' ? t('categories.form.incomeType') : t('transactions.form.typeTransfer')
}

function formatAmount(n: number, decimalSeparator: string): string {
  return n.toFixed(2).replace('.', decimalSeparator)
}

/**
 * All of the signed-in profile's transactions, oldest first, as a
 * semicolon-delimited CSV string (with UTF-8 BOM). The base-currency column
 * is the same figure OperationsDataView.vue shows for a row: an exact
 * recorded amount when the operation has one in the base currency,
 * otherwise converted at the rate of the operation's own day. Async
 * because those days' rates are loaded up front, all at once (see
 * db/exchangeRates.ts), rather than one awaited lookup per row.
 */
export async function buildTransactionsCsv(): Promise<string> {
  const allAccounts = useAllAccountsStore()
  const profiles = useProfilesStore()
  const categories = useCategoriesStore()
  const tags = useTagsStore()
  const transactions = useTransactionsStore()
  const settings = useSettingsStore()
  const viewAs = useViewAsStore()

  const header: CsvCell[] = [
    t('csv.header.date'),
    t('csv.header.type'),
    t('csv.header.account'),
    t('csv.header.destAccount'),
    t('csv.header.category'),
    t('csv.header.subcategory'),
    t('csv.header.tags'),
    t('csv.header.amount'),
    t('csv.header.currency'),
    t('csv.header.baseAmount', { currency: settings.baseCurrency }),
    t('csv.header.note'),
  ]

  const base = settings.baseCurrency
  const otherCurrencyAmount = (t: Transaction) =>
    resolveOtherCurrencyAmount(
      t,
      (id) => allAccounts.byId(id)?.currency,
      (id) => resolveCategoryCurrency(categories.byId(id), base, transactions.all),
    )

  const sorted = [...transactions.all].sort((a, b) => a.date - b.date)
  const others = new Map(sorted.map((t) => [t.id, otherCurrencyAmount(t)]))
  // Only the days a row actually has to be converted on — not ones whose
  // every operation is already in the base currency, or has it recorded.
  const neededKeys = new Set(
    sorted.filter((t) => t.currency !== base && others.get(t.id)?.currency !== base).map((t) => snapshotKey(t.date)),
  )
  const snapshots = new Map<string, RateSnapshot | null>(
    await Promise.all([...neededKeys].map(async (key) => [key, await resolveSnapshot(key)] as const)),
  )
  const toBase: ToBase = (amount, currency, when = Date.now()) => {
    const snapshot = snapshots.get(snapshotKey(when))
    const rate = snapshot ? crossRate(snapshot, currency, base) : null
    return amount * (rate ?? 1)
  }

  const { delimiter, decimalSeparator } = csvNumberFormat()
  const rows: CsvCell[][] = [header]
  for (const t of sorted) {
    const signedAmount = t.type === 'expense' ? -t.amount : t.amount
    const signedBaseAmount = signedAmountInCurrency(
      nativeSignedAmount(t, viewAs.effectiveUid),
      t.currency,
      base,
      others.get(t.id) ?? null,
      toBase,
      t.date,
    )
    rows.push([
      formatDate(t.date),
      typeLabel(t.type),
      resolveAccountLabel(t.accountId, viewAs.effectiveUid, allAccounts.all, profiles.all),
      t.type === 'transfer' ? resolveAccountLabel(t.toAccountId, viewAs.effectiveUid, allAccounts.all, profiles.all) : '',
      categories.byId(t.categoryId)?.name ?? '',
      categories.byId(t.subcategoryId)?.name ?? '',
      (t.tagIds ?? []).map((id) => tags.byId(id)?.name).filter(Boolean).join(', '),
      formatAmount(signedAmount, decimalSeparator),
      t.currency,
      formatAmount(signedBaseAmount, decimalSeparator),
      t.note ?? '',
    ])
  }

  return CSV_BOM + toCsv(rows, delimiter)
}

export async function downloadTransactionsCsv(): Promise<void> {
  const csv = await buildTransactionsCsv()
  downloadFile(csv, `stork-transactions-${dateKey(Date.now())}.csv`, 'text/csv;charset=utf-8')
}
