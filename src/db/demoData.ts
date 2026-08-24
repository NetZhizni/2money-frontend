import { useAccountsStore } from '../stores/accounts'
import { useCategoriesStore } from '../stores/categories'
import { useSettingsStore } from '../stores/settings'
import { useTransactionsStore } from '../stores/transactions'
import { useAuthStore } from '../stores/auth'
import { db } from './schema'
import { enqueueUpsertMany } from './sync'
import { newId } from '../utils/id'
import { convertAmount } from './exchangeRates'
import type { Account, Transaction, TransactionType } from '../types/models'

const DEMO_MONTHS = 6

function randInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1))
}
function randFloat(min: number, max: number, decimals = 2): number {
  const v = min + Math.random() * (max - min)
  const f = 10 ** decimals
  return Math.round(v * f) / f
}
function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)]
}
function weightedPick<T extends { weight: number }>(arr: T[]): T {
  const total = arr.reduce((s, x) => s + x.weight, 0)
  let r = Math.random() * total
  for (const item of arr) {
    r -= item.weight
    if (r <= 0) return item
  }
  return arr[arr.length - 1]
}

interface ExpenseSpec {
  name: string
  weight: number
  min: number
  max: number
}

const EXPENSE_SPECS: ExpenseSpec[] = [
  { name: 'Продукти', weight: 6, min: 60, max: 950 },
  { name: 'Кафе і ресторани', weight: 3, min: 80, max: 650 },
  { name: 'Дозвілля', weight: 2, min: 100, max: 1200 },
  { name: 'Транспорт', weight: 3, min: 40, max: 420 },
  { name: 'Покупки', weight: 2, min: 150, max: 2500 },
  { name: 'Одяг', weight: 1, min: 300, max: 2200 },
  { name: 'Подарунки', weight: 1, min: 200, max: 1600 },
  { name: "Зв'язок", weight: 1, min: 150, max: 420 },
  { name: 'Дім', weight: 2, min: 300, max: 3200 },
  { name: 'Машина', weight: 1, min: 200, max: 3000 },
  { name: "Здоров'я", weight: 1, min: 150, max: 2000 },
  { name: 'Розвиток', weight: 1, min: 200, max: 1500 },
  { name: 'Краса і чистота', weight: 1, min: 150, max: 900 },
  { name: 'Домашні тварини', weight: 1, min: 100, max: 700 },
]

const INCOME_SPECS: ExpenseSpec[] = [
  { name: 'Зарплата', weight: 1, min: 15000, max: 35000 },
  { name: 'Підробіток', weight: 2, min: 500, max: 6000 },
]

const NOTES: Record<string, string[]> = {
  'Кафе і ресторани': ['Бізнес-ланч', 'Вечеря з друзями', 'Кава на виніс', ''],
  Транспорт: ['Заправка', 'Таксі', 'Проїзний', ''],
  Дім: ['Комунальні', 'Ремонт', ''],
  Дозвілля: ['Кіно', 'Концерт', ''],
}

function randomNote(categoryName: string): string | undefined {
  const options = NOTES[categoryName]
  if (!options) return undefined
  const note = pick(options)
  return note || undefined
}

/**
 * Populates the app with a realistic, RANDOMIZED demo dataset spanning the
 * last 6 months: a fixed set of accounts (so the mix of account types stays
 * meaningful), plus 1–10 randomly generated transactions per calendar day
 * across that whole window (expense-heavy, with occasional income and
 * transfers).
 *
 * Only ever runs against an empty account (no existing accounts or
 * transactions) — mixing demo accounts/transactions in with real ones would
 * pollute real analytics, and there's no marker distinguishing demo data from
 * real data afterwards to undo it selectively. Reset via `resetAllData` (see
 * `db/reset.ts`) before loading demo data again.
 */
export async function loadDemoData(): Promise<void> {
  const accounts = useAccountsStore()
  const categories = useCategoriesStore()
  const settings = useSettingsStore()
  const transactions = useTransactionsStore()
  const authStore = useAuthStore()
  const ownerId = authStore.uid!

  if (accounts.all.length > 0 || transactions.all.length > 0) {
    throw new Error('Демо-дані можна додати лише коли немає інших даних. Спершу скиньте всі дані.')
  }

  const byName = (name: string) => categories.all.find((c) => c.name === name)
  const cafe = byName('Кафе і ресторани')

  let cafeLunch = cafe ? categories.childrenOf(cafe.id).find((c) => c.name === 'Обід на роботі') : undefined
  if (cafe && !cafeLunch) {
    cafeLunch = await categories.add({
      name: 'Обід на роботі',
      kind: 'expense',
      icon: cafe.icon,
      color: cafe.color,
      parentId: cafe.id,
      archived: false,
    })
  }

  const accountDefs: Array<Omit<Account, 'id' | 'createdAt' | 'order' | 'ownerId'>> = [
    {
      name: 'Mono',
      type: 'regular',
      currency: 'UAH',
      icon: 'mdiCardAccountDetailsOutline',
      color: '#2a78d6',
      initialBalance: randInt(1500, 6000),
      includeInTotal: true,
      archived: false,
    },
    {
      name: 'ПриватБанк',
      type: 'regular',
      currency: 'UAH',
      icon: 'mdiCreditCardOutline',
      color: '#eda100',
      initialBalance: randInt(4000, 12000),
      includeInTotal: true,
      archived: false,
    },
    {
      name: 'Заощадження',
      type: 'savings',
      currency: 'UAH',
      icon: 'mdiPiggyBankOutline',
      color: '#1baf7a',
      initialBalance: randInt(8000, 25000),
      includeInTotal: true,
      archived: false,
    },
    {
      name: 'USD готівка',
      type: 'regular',
      currency: 'USD',
      icon: 'mdiCashMultiple',
      color: '#4a3aa7',
      initialBalance: randInt(50, 300),
      includeInTotal: true,
      archived: false,
    },
    {
      name: 'Позика Максиму',
      type: 'loan',
      loanDirection: 'lent',
      currency: 'UAH',
      icon: 'mdiHandshakeOutline',
      color: '#e34948',
      initialBalance: 0,
      includeInTotal: false,
      archived: false,
    },
  ]

  const created: Record<string, Account> = {}
  for (const def of accountDefs) {
    created[def.name] = await accounts.add(def)
  }

  const uahAccountIds = [created['Mono'].id, created['ПриватБанк'].id]
  const usdAccountId = created['USD готівка'].id
  const savingsAccountId = created['Заощадження'].id

  // Demo transactions never need historical precision, so resolve each
  // currency's rate to the app's base currency once (pivoting through NBU's
  // UAH rates) and reuse it everywhere instead of one call per transaction.
  const uahToBaseRate = await convertAmount(1, 'UAH', settings.baseCurrency)
  const usdToBaseRate = await convertAmount(1, 'USD', settings.baseCurrency)
  // The real UAH<->USD market rate, used only to scale a "UAH-shaped" random
  // amount range down to a realistic USD figure — independent of base currency.
  const uahPerUsd = await convertAmount(1, 'USD', 'UAH')

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const startDay = new Date(today)
  startDay.setMonth(startDay.getMonth() - DEMO_MONTHS)

  const newTransactions: Transaction[] = []
  const now = Date.now()

  for (let day = new Date(startDay); day <= today; day.setDate(day.getDate() + 1)) {
    const count = randInt(1, 10)
    for (let i = 0; i < count; i++) {
      const roll = Math.random()
      const type: TransactionType = roll < 0.08 ? 'income' : roll < 0.15 ? 'transfer' : 'expense'
      const when = new Date(day)
      when.setHours(randInt(7, 22), randInt(0, 59), 0, 0)
      const ts = when.getTime()

      if (type === 'transfer') {
        const fromId = pick(uahAccountIds)
        const toId = fromId === savingsAccountId ? pick(uahAccountIds) : savingsAccountId
        if (fromId === toId) continue
        const amount = randFloat(300, 5000)
        newTransactions.push({
          id: newId(),
          ownerId,
          participantIds: [ownerId],
          type: 'transfer',
          date: ts,
          accountId: fromId,
          toAccountId: toId,
          amount,
          currency: 'UAH',
          exchangeRate: 1,
          baseAmount: 0,
          createdAt: now,
          updatedAt: now,
        })
        continue
      }

      const spec = weightedPick(type === 'income' ? INCOME_SPECS : EXPENSE_SPECS)
      const category = byName(spec.name)
      if (!category) continue

      const useUsd = Math.random() < 0.08
      const accountId = useUsd ? usdAccountId : pick(uahAccountIds)
      const currency = useUsd ? 'USD' : 'UAH'
      const rate = useUsd ? usdToBaseRate : uahToBaseRate
      const uahAmount = randFloat(spec.min, spec.max)
      const amount = useUsd ? Math.round((uahAmount / uahPerUsd) * 100) / 100 : uahAmount

      const subcategoryId =
        spec.name === 'Кафе і ресторани' && cafeLunch && Math.random() < 0.3 ? cafeLunch.id : null

      newTransactions.push({
        id: newId(),
        ownerId,
        participantIds: [ownerId],
        type,
        date: ts,
        accountId,
        categoryId: category.id,
        subcategoryId,
        amount,
        currency,
        exchangeRate: rate,
        baseAmount: type === 'expense' ? -amount * rate : amount * rate,
        note: randomNote(spec.name),
        createdAt: now,
        updatedAt: now,
      })
    }
  }

  await db.transactions.bulkPut(newTransactions)
  await enqueueUpsertMany('transactions', ownerId, newTransactions)
}
