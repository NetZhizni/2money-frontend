import { useAllAccountsStore } from '../stores/allAccounts'
import { useProfilesStore } from '../stores/profiles'
import { useCategoriesStore } from '../stores/categories'
import { useTransactionsStore } from '../stores/transactions'
import { useSettingsStore } from '../stores/settings'
import { useViewAsStore } from '../stores/viewAs'
import { resolveAccountLabel } from '../utils/accountLabel'
import { toCsv, CSV_BOM, type CsvCell } from '../utils/csv'
import { downloadFile } from '../utils/download'
import { dateKey } from '../utils/format'
import type { Transaction } from '../types/models'

// ";" + comma decimals opens correctly in Excel under a Ukrainian locale with
// no manual import step (Excel there treats "," as the list separator and
// "," inside a number as the decimal point) — Google Sheets needs the
// delimiter picked manually on import, an acceptable trade-off here.
const CSV_DELIMITER = ';'

const TYPE_LABEL: Record<Transaction['type'], string> = {
  expense: 'Витрата',
  income: 'Дохід',
  transfer: 'Переказ',
}

function formatAmount(n: number): string {
  return n.toFixed(2).replace('.', ',')
}

/** All of the signed-in profile's transactions, oldest first, as a semicolon-delimited CSV string (with UTF-8 BOM). */
export function buildTransactionsCsv(): string {
  const allAccounts = useAllAccountsStore()
  const profiles = useProfilesStore()
  const categories = useCategoriesStore()
  const transactions = useTransactionsStore()
  const settings = useSettingsStore()
  const viewAs = useViewAsStore()

  const header: CsvCell[] = [
    'Дата',
    'Тип',
    'Рахунок',
    'Рахунок отримувача',
    'Категорія',
    'Підкатегорія',
    'Сума',
    'Валюта',
    `Сума (${settings.baseCurrency})`,
    'Нотатка',
  ]

  const rows: CsvCell[][] = [header]
  const sorted = [...transactions.all].sort((a, b) => a.date - b.date)
  for (const t of sorted) {
    const signedAmount = t.type === 'expense' ? -t.amount : t.amount
    rows.push([
      dateKey(t.date),
      TYPE_LABEL[t.type],
      resolveAccountLabel(t.accountId, viewAs.effectiveUid, allAccounts.all, profiles.all),
      t.type === 'transfer' ? resolveAccountLabel(t.toAccountId, viewAs.effectiveUid, allAccounts.all, profiles.all) : '',
      categories.byId(t.categoryId)?.name ?? '',
      categories.byId(t.subcategoryId)?.name ?? '',
      formatAmount(signedAmount),
      t.currency,
      formatAmount(t.baseAmount),
      t.note ?? '',
    ])
  }

  return CSV_BOM + toCsv(rows, CSV_DELIMITER)
}

export function downloadTransactionsCsv(): void {
  downloadFile(buildTransactionsCsv(), `fintrack-transactions-${dateKey(Date.now())}.csv`, 'text/csv;charset=utf-8')
}
