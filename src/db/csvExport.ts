import { useAllAccountsStore } from '../stores/allAccounts'
import { useProfilesStore } from '../stores/profiles'
import { useCategoriesStore } from '../stores/categories'
import { useTransactionsStore } from '../stores/transactions'
import { useSettingsStore } from '../stores/settings'
import { useViewAsStore } from '../stores/viewAs'
import { resolveAccountLabel } from '../utils/accountLabel'
import { toCsv, CSV_BOM, type CsvCell } from '../utils/csv'
import { downloadFile } from '../utils/download'
import { dateKey, formatDate, getNumberFormatSetting } from '../utils/format'
import { nativeSignedAmount } from '../utils/transactionAmounts'
import { convertLatest } from './exchangeRates'
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
const numberFormatSetting = getNumberFormatSetting()
const usesCommaDecimal = numberFormatSetting === 'auto' ? locale === 'uk' : numberFormatSetting === 'uk' || numberFormatSetting === 'eu'
const CSV_DELIMITER = usesCommaDecimal ? ';' : ','
const DECIMAL_SEPARATOR = usesCommaDecimal ? ',' : '.'

function typeLabel(type: Transaction['type']): string {
  return type === 'expense' ? t('categories.form.expenseType') : type === 'income' ? t('categories.form.incomeType') : t('transactions.form.typeTransfer')
}

function formatAmount(n: number): string {
  return n.toFixed(2).replace('.', DECIMAL_SEPARATOR)
}

/**
 * All of the signed-in profile's transactions, oldest first, as a
 * semicolon-delimited CSV string (with UTF-8 BOM). Async: the base-currency
 * column has no stored snapshot to read anymore (see types/models.ts), so it
 * resolves one live rate per distinct currency up front (rather than one
 * `convertLatest` call per row) and reuses it for every row in that currency.
 */
export async function buildTransactionsCsv(): Promise<string> {
  const allAccounts = useAllAccountsStore()
  const profiles = useProfilesStore()
  const categories = useCategoriesStore()
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
    t('csv.header.amount'),
    t('csv.header.currency'),
    t('csv.header.baseAmount', { currency: settings.baseCurrency }),
    t('csv.header.note'),
  ]

  const sorted = [...transactions.all].sort((a, b) => a.date - b.date)
  const currencies = [...new Set(sorted.map((t) => t.currency))]
  const rateEntries = await Promise.all(
    currencies.map(async (currency) => [currency, await convertLatest(1, currency, settings.baseCurrency)] as const),
  )
  const rateToBase = new Map(rateEntries)

  const rows: CsvCell[][] = [header]
  for (const t of sorted) {
    const signedAmount = t.type === 'expense' ? -t.amount : t.amount
    const signedBaseAmount = nativeSignedAmount(t, viewAs.effectiveUid) * (rateToBase.get(t.currency) ?? 1)
    rows.push([
      formatDate(t.date),
      typeLabel(t.type),
      resolveAccountLabel(t.accountId, viewAs.effectiveUid, allAccounts.all, profiles.all),
      t.type === 'transfer' ? resolveAccountLabel(t.toAccountId, viewAs.effectiveUid, allAccounts.all, profiles.all) : '',
      categories.byId(t.categoryId)?.name ?? '',
      categories.byId(t.subcategoryId)?.name ?? '',
      formatAmount(signedAmount),
      t.currency,
      formatAmount(signedBaseAmount),
      t.note ?? '',
    ])
  }

  return CSV_BOM + toCsv(rows, CSV_DELIMITER)
}

export async function downloadTransactionsCsv(): Promise<void> {
  const csv = await buildTransactionsCsv()
  downloadFile(csv, `fintrack-transactions-${dateKey(Date.now())}.csv`, 'text/csv;charset=utf-8')
}
