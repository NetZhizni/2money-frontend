import { useAccountsStore } from '../stores/accounts'
import { useCategoriesStore } from '../stores/categories'
import { useTagsStore } from '../stores/tags'
import { useTransactionsStore } from '../stores/transactions'
import { useAuthStore } from '../stores/auth'
import { useSettingsStore } from '../stores/settings'
import { putAndQueue } from './sync'
import { newId } from '../utils/id'
import { convertAmount } from './exchangeRates'
import { resolveCategoryCurrency } from '../utils/currencies'
import { monthKeyFromTimestamp, roundToNiceAmount } from '../utils/budget'
import { DEFAULT_CATEGORY_DEFS, DEFAULT_SUBCATEGORY_DEFS } from './defaultCategories'
import { t } from '../i18n'
import type { MessageKey } from '../i18n'
import type { DefaultCategoryDef } from './defaultCategories'
import type { Account, Budget, Category, Receipt, Tag, Transaction, TransactionType } from '../types/models'

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
/** `count` distinct random elements of `arr` (count is clamped to arr.length) — used to pick a random subset of a receipt's possible line items. */
function pickMany<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(count, arr.length))
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

function defByKey(key: MessageKey): DefaultCategoryDef {
  const def = DEFAULT_CATEGORY_DEFS.find((d) => d.key === key)
  if (!def) throw new Error(`[demoData] unknown default category key: ${key}`)
  return def
}

interface ExpenseSpec {
  defKey: MessageKey
  weight: number
  min: number
  max: number
  noteKeys?: MessageKey[]
  /** An optional default subcategory (see defaultCategories.ts) a fraction of this spec's transactions land under instead of the bare top-level category. */
  sub?: { key: MessageKey; chance: number }
}

const EXPENSE_SPECS: ExpenseSpec[] = [
  { defKey: 'seed.expense.groceries', weight: 6, min: 60, max: 950 },
  {
    defKey: 'seed.expense.cafes',
    weight: 3,
    min: 80,
    max: 650,
    noteKeys: ['demo.note.cafes.businessLunch', 'demo.note.cafes.dinnerWithFriends', 'demo.note.cafes.coffeeToGo'],
    sub: { key: 'seed.expense.cafes.lunch', chance: 0.3 },
  },
  { defKey: 'seed.expense.transport', weight: 3, min: 40, max: 420, noteKeys: ['demo.note.transport.fuel', 'demo.note.transport.taxi', 'demo.note.transport.pass'] },
  { defKey: 'seed.expense.car', weight: 1, min: 200, max: 3000 },
  { defKey: 'seed.expense.shopping', weight: 2, min: 150, max: 2500, sub: { key: 'seed.expense.shopping.clothing', chance: 0.3 } },
  { defKey: 'seed.expense.leisure', weight: 2, min: 100, max: 1200, noteKeys: ['demo.note.leisure.cinema', 'demo.note.leisure.concert'] },
  { defKey: 'seed.expense.travel', weight: 1, min: 500, max: 8000 },
  { defKey: 'seed.expense.gifts', weight: 1, min: 200, max: 1600 },
  { defKey: 'seed.expense.communication', weight: 1, min: 150, max: 420 },
  { defKey: 'seed.expense.home', weight: 2, min: 300, max: 3200, noteKeys: ['demo.note.home.utilities', 'demo.note.home.repair'] },
  { defKey: 'seed.expense.health', weight: 1, min: 150, max: 2000 },
  { defKey: 'seed.expense.selfDevelopment', weight: 1, min: 200, max: 1500 },
  { defKey: 'seed.expense.beautyAndHygiene', weight: 1, min: 150, max: 900 },
  { defKey: 'seed.expense.pets', weight: 1, min: 100, max: 700 },
]

const INCOME_SPECS: ExpenseSpec[] = [
  { defKey: 'seed.income.salary', weight: 3, min: 15000, max: 35000 },
  { defKey: 'seed.income.sideJob', weight: 2, min: 500, max: 6000 },
  { defKey: 'seed.income.gifts', weight: 1, min: 300, max: 3000 },
  { defKey: 'seed.income.investments', weight: 1, min: 200, max: 2500 },
  { defKey: 'seed.income.other', weight: 1, min: 100, max: 1500 },
]

function randomNote(spec: ExpenseSpec): string | undefined {
  if (!spec.noteKeys?.length) return undefined
  // One extra slot that resolves to "no note" — keeps a chunk of transactions
  // note-free, same as the old literal '' entry in each pool used to.
  const roll = randInt(0, spec.noteKeys.length)
  return roll < spec.noteKeys.length ? t(spec.noteKeys[roll]) : undefined
}

interface ReceiptItemSpec {
  defKey: MessageKey
  min: number
  max: number
}
interface ReceiptSpec {
  merchantKey: MessageKey
  items: ReceiptItemSpec[]
}

/**
 * A "чек" (see types/models.ts's Receipt) is a merchant visit split across
 * several categories in one go — a supermarket run that's part groceries,
 * part household goods, say. Demo receipts pick a random 2-3 item subset of
 * their spec's possible items so not every one looks identical.
 */
const RECEIPT_SPECS: ReceiptSpec[] = [
  {
    merchantKey: 'demo.receipt.supermarket',
    items: [
      { defKey: 'seed.expense.groceries', min: 400, max: 1400 },
      { defKey: 'seed.expense.beautyAndHygiene', min: 80, max: 350 },
      { defKey: 'seed.expense.home', min: 60, max: 300 },
      { defKey: 'seed.expense.pets', min: 80, max: 400 },
    ],
  },
  {
    merchantKey: 'demo.receipt.pharmacy',
    items: [
      { defKey: 'seed.expense.health', min: 150, max: 900 },
      { defKey: 'seed.expense.beautyAndHygiene', min: 60, max: 250 },
    ],
  },
  {
    merchantKey: 'demo.receipt.hardware',
    items: [
      { defKey: 'seed.expense.home', min: 300, max: 2500 },
      { defKey: 'seed.expense.car', min: 200, max: 1500 },
    ],
  },
  {
    merchantKey: 'demo.receipt.household',
    items: [
      { defKey: 'seed.expense.groceries', min: 300, max: 1100 },
      { defKey: 'seed.expense.home', min: 100, max: 600 },
      { defKey: 'seed.expense.beautyAndHygiene', min: 50, max: 300 },
    ],
  },
]
const RECEIPT_COUNT = 12

interface TagSpec {
  nameKey: MessageKey
  color: string
  /** Top-level `defKey`s (see ExpenseSpec/ReceiptItemSpec) this tag can land on — a tag is a cross-cutting label, so most match several unrelated categories rather than just one. */
  matches: MessageKey[]
  /** Independent per matching transaction — a transaction can end up carrying more than one tag (e.g. a cafe visit tagged both "business" and, rarely, nothing else), same as a real user would apply them. */
  chance: number
}

const TAG_SPECS: TagSpec[] = [
  { nameKey: 'demo.tag.vacation', color: '#2a78d6', matches: ['seed.expense.travel', 'seed.expense.leisure'], chance: 0.45 },
  { nameKey: 'demo.tag.renovation', color: '#eb6834', matches: ['seed.expense.home', 'seed.expense.shopping'], chance: 0.3 },
  { nameKey: 'demo.tag.business', color: '#7e57c2', matches: ['seed.expense.cafes', 'seed.expense.communication', 'seed.expense.transport'], chance: 0.25 },
  { nameKey: 'demo.tag.gifts', color: '#e87ba4', matches: ['seed.expense.gifts', 'seed.income.gifts'], chance: 0.6 },
  { nameKey: 'demo.tag.sideIncome', color: '#eda100', matches: ['seed.income.sideJob', 'seed.income.investments'], chance: 0.5 },
]

/**
 * Populates the app with a realistic, RANDOMIZED demo dataset spanning the
 * last 6 months: a fixed set of accounts (so the mix of account types stays
 * meaningful), 1–10 randomly generated transactions per calendar day across
 * that whole window (expense-heavy, with occasional income and transfers),
 * plus a handful of multi-item "чеки" (see Receipt) to demonstrate that
 * feature too, plus a starting set of Budget rows (see views/BudgetDataView.vue)
 * derived from that same generated spend. A handful of cross-cutting Tag rows
 * (see TAG_SPECS) are created up front and randomly attached to whichever
 * generated transactions/receipt items land under a matching category, so
 * the Tags feature has a realistic, non-trivial dataset to demonstrate too.
 *
 * Transactions are filed under the app's own default categories (see
 * db/defaultCategories.ts) — the SAME ones "Створити базові категорії"
 * creates — resolved by translating each spec's key in whatever locale is
 * active right now, so this works correctly regardless of which language the
 * categories were created in or which language is active now (a category
 * renamed or deleted by the user simply drops out — see byDef below).
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
  const tags = useTagsStore()
  const transactions = useTransactionsStore()
  const authStore = useAuthStore()
  const settings = useSettingsStore()
  const ownerId = authStore.uid!

  if (accounts.all.length > 0 || transactions.all.length > 0) {
    throw new Error(t('errors.demoDataBlocked'))
  }

  /** The real, top-level category for a default def — resolved by (kind, name) since a category's own id isn't known ahead of time. */
  function byDef(def: DefaultCategoryDef): Category | undefined {
    return categories.all.find((c) => c.parentId === null && c.kind === def.kind && c.name === t(def.key))
  }

  /** Finds (or lazily creates, same as the pre-existing "Обід на роботі" behavior) a default subcategory under its resolved parent. Returns undefined if the parent itself doesn't exist (renamed/deleted by the user). */
  async function ensureDefaultSubcategory(key: MessageKey): Promise<Category | undefined> {
    const sub = DEFAULT_SUBCATEGORY_DEFS.find((s) => s.key === key)
    if (!sub) return undefined
    const parent = byDef(defByKey(sub.parentKey))
    if (!parent) return undefined
    const name = t(sub.key)
    const existing = categories.childrenOf(parent.id).find((c) => c.name === name)
    if (existing) return existing
    return categories.add({
      name,
      kind: parent.kind,
      icon: parent.icon,
      color: parent.color,
      parentId: parent.id,
      archived: false,
      isDefault: true,
    })
  }

  const subcategoryCache = new Map<MessageKey, Category | undefined>()
  async function subcategoryFor(key: MessageKey): Promise<Category | undefined> {
    if (!subcategoryCache.has(key)) subcategoryCache.set(key, await ensureDefaultSubcategory(key))
    return subcategoryCache.get(key)
  }

  // Same lazily-reuse-by-name pattern as ensureDefaultSubcategory above —
  // tags are a shared family resource that reset.ts never wipes (see its own
  // doc comment), so re-running demo data after a reset must reuse whatever
  // this function already created instead of piling up duplicates.
  async function ensureTag(spec: TagSpec): Promise<Tag> {
    const name = t(spec.nameKey)
    const existing = tags.all.find((tg) => tg.name === name)
    if (existing) return existing
    return tags.add({ name, color: spec.color })
  }
  const tagByKey = new Map<MessageKey, Tag>()
  for (const spec of TAG_SPECS) {
    tagByKey.set(spec.nameKey, await ensureTag(spec))
  }

  /** Rolls each TAG_SPEC matching `defKey` independently — returns `undefined` (not `[]`) when none land, matching Transaction.tagIds's own "absent means no tags" convention. */
  function tagIdsFor(defKey: MessageKey): string[] | undefined {
    const ids = TAG_SPECS.filter((spec) => spec.matches.includes(defKey) && Math.random() < spec.chance).map((spec) => tagByKey.get(spec.nameKey)!.id)
    return ids.length ? ids : undefined
  }

  // Fail fast, before creating any demo accounts, if none of the categories
  // this data would be filed under actually exist (e.g. "Очистити всі
  // категорії" was used and "Створити базові категорії" wasn't run again
  // yet) — otherwise this would silently produce accounts and transfers with
  // no income/expense transactions at all, which is exactly the confusing
  // state this guard exists to prevent.
  const anyCategoryResolvable = [...EXPENSE_SPECS, ...INCOME_SPECS].some((spec) => byDef(defByKey(spec.defKey)))
  if (!anyCategoryResolvable) {
    throw new Error(t('errors.noCategoriesForDemo'))
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
      name: 'PrivatBank',
      type: 'regular',
      currency: 'UAH',
      icon: 'mdiCreditCardOutline',
      color: '#eda100',
      initialBalance: randInt(4000, 12000),
      includeInTotal: true,
      archived: false,
    },
    {
      name: t('demo.account.savings'),
      type: 'savings',
      currency: 'UAH',
      icon: 'mdiPiggyBankOutline',
      color: '#1baf7a',
      initialBalance: randInt(8000, 25000),
      includeInTotal: true,
      archived: false,
    },
    {
      name: t('demo.account.usdCash'),
      type: 'regular',
      currency: 'USD',
      icon: 'mdiCashMultiple',
      color: '#4a3aa7',
      initialBalance: randInt(50, 300),
      includeInTotal: true,
      archived: false,
    },
    {
      name: t('demo.account.loan'),
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

  const uahAccountIds = [created['Mono'].id, created['PrivatBank'].id]
  const usdAccountId = created[t('demo.account.usdCash')].id
  const savingsAccountId = created[t('demo.account.savings')].id
  const loanAccountId = created[t('demo.account.loan')].id

  // Every demo account's own currency, by id — used below to fill `toAmount`
  // (see Transaction.toAmount) on EVERY transaction, not just the ones that
  // happen to need real conversion. TransactionFormModal.vue only ever
  // leaves `toAmount` unset for a genuinely same-currency operation; a demo
  // transaction against the USD account (or, once one exists, a
  // foreign-currency transfer) left without it is exactly what made
  // OperationsDataView.vue/TransactionFormModal.vue's dual-currency amount
  // silently read as 0 — see otherCurrencyAmount()'s `toAmount == null` guard
  // in utils/transactionAmounts.ts. Every reader of `toAmount` already
  // re-checks currency equality on its own before using it, so setting it to
  // the same value as `amount` for a same-currency row (the common case) is
  // harmless — it's simply never looked at.
  const accountCurrency: Record<string, string> = {}
  for (const acc of Object.values(created)) accountCurrency[acc.id] = acc.currency

  // The real UAH<->USD market rate, used only to scale a "UAH-shaped" random
  // amount range down to a realistic USD figure — independent of base currency.
  const uahPerUsd = await convertAmount(1, 'USD', 'UAH')

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const startDay = new Date(today)
  startDay.setMonth(startDay.getMonth() - DEMO_MONTHS)

  const newTransactions: Transaction[] = []
  const newReceipts: Receipt[] = []
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
        const fromCurrency = accountCurrency[fromId]
        const toCurrency = accountCurrency[toId]
        newTransactions.push({
          id: newId(),
          ownerId,
          participantIds: [ownerId],
          type: 'transfer',
          date: ts,
          accountId: fromId,
          toAccountId: toId,
          amount,
          currency: fromCurrency,
          toAmount: await convertAmount(amount, fromCurrency, toCurrency, ts),
          createdAt: now,
          updatedAt: now,
        })
        continue
      }

      const spec = weightedPick(type === 'income' ? INCOME_SPECS : EXPENSE_SPECS)
      const category = byDef(defByKey(spec.defKey))
      if (!category) continue

      const useUsd = Math.random() < 0.08
      const accountId = useUsd ? usdAccountId : pick(uahAccountIds)
      const currency = useUsd ? 'USD' : 'UAH'
      const uahAmount = randFloat(spec.min, spec.max)
      const amount = useUsd ? Math.round((uahAmount / uahPerUsd) * 100) / 100 : uahAmount

      const sub = spec.sub && Math.random() < spec.sub.chance ? await subcategoryFor(spec.sub.key) : undefined

      // The category's own currency (always set on a default category — see
      // db/seed.ts's buildDefaultCategories) — `toAmount` records `amount` as
      // converted into it, exactly like TransactionFormModal.vue's dual
      // calculator would have for a real operation (see accountCurrency's
      // own doc comment above for why this is filled even when it equals
      // `amount` one-for-one).
      const categoryCurrency = resolveCategoryCurrency(category, settings.baseCurrency)
      const toAmount = await convertAmount(amount, currency, categoryCurrency, ts)

      newTransactions.push({
        id: newId(),
        ownerId,
        participantIds: [ownerId],
        type,
        date: ts,
        accountId,
        categoryId: category.id,
        subcategoryId: sub?.id ?? null,
        amount,
        currency,
        toAmount,
        note: randomNote(spec),
        tagIds: tagIdsFor(spec.defKey),
        createdAt: now,
        updatedAt: now,
      })
    }
  }

  // One lend-and-partial-repay pair, so the demo also exercises the `loan`
  // account type (see Account.loanDirection): money out to the loan account,
  // then part of it back later — the repayment is skipped entirely if its
  // date would land in the future, so the demo never shows a transaction
  // that hasn't "happened" yet.
  const loanGivenAt = new Date(startDay)
  loanGivenAt.setDate(loanGivenAt.getDate() + randInt(5, 20))
  loanGivenAt.setHours(randInt(10, 19), randInt(0, 59), 0, 0)
  const loanFromId = pick(uahAccountIds)
  const loanAmount = randFloat(3000, 9000)
  newTransactions.push({
    id: newId(),
    ownerId,
    participantIds: [ownerId],
    type: 'transfer',
    date: loanGivenAt.getTime(),
    accountId: loanFromId,
    toAccountId: loanAccountId,
    amount: loanAmount,
    currency: accountCurrency[loanFromId],
    toAmount: loanAmount,
    note: t('demo.note.loan.lent'),
    createdAt: now,
    updatedAt: now,
  })

  const loanRepaidAt = new Date(loanGivenAt)
  loanRepaidAt.setDate(loanRepaidAt.getDate() + randInt(30, 60))
  if (loanRepaidAt <= today) {
    const loanRepaidTo = pick(uahAccountIds)
    const repaidAmount = roundToNiceAmount(loanAmount * randFloat(0.3, 0.6))
    newTransactions.push({
      id: newId(),
      ownerId,
      participantIds: [ownerId],
      type: 'transfer',
      date: loanRepaidAt.getTime(),
      accountId: loanAccountId,
      toAccountId: loanRepaidTo,
      amount: repaidAmount,
      currency: accountCurrency[loanAccountId],
      toAmount: repaidAmount,
      note: t('demo.note.loan.repaid'),
      createdAt: now,
      updatedAt: now,
    })
  }

  // A handful of multi-item receipts spread across the same window, to show
  // off the "чек" feature too — same account/date/currency for every item in
  // one receipt, each item its own category and amount (see ReceiptGroupCard.vue).
  const totalDays = Math.max(1, Math.round((today.getTime() - startDay.getTime()) / 86_400_000))
  for (let i = 0; i < RECEIPT_COUNT; i++) {
    const day = new Date(startDay)
    day.setDate(day.getDate() + randInt(0, totalDays))
    const spec = pick(RECEIPT_SPECS)
    const items = pickMany(spec.items, randInt(2, Math.min(3, spec.items.length)))
    const resolvedItems = items
      .map((item) => ({ item, category: byDef(defByKey(item.defKey)) }))
      .filter((x): x is { item: ReceiptItemSpec; category: Category } => !!x.category)
    if (resolvedItems.length === 0) continue

    const receiptId = newId()
    const accountId = pick(uahAccountIds)
    const baseWhen = new Date(day)
    baseWhen.setHours(randInt(9, 20), randInt(0, 59), 0, 0)

    const receiptCurrency = accountCurrency[accountId]
    for (let itemIndex = 0; itemIndex < resolvedItems.length; itemIndex++) {
      const { item, category } = resolvedItems[itemIndex]
      const when = new Date(baseWhen.getTime() + itemIndex * 60_000) // a minute apart so they still sort predictably within the receipt
      const itemAmount = randFloat(item.min, item.max)
      const categoryCurrency = resolveCategoryCurrency(category, settings.baseCurrency)
      newTransactions.push({
        id: newId(),
        ownerId,
        participantIds: [ownerId],
        type: 'expense',
        date: when.getTime(),
        accountId,
        categoryId: category.id,
        subcategoryId: null,
        amount: itemAmount,
        currency: receiptCurrency,
        toAmount: await convertAmount(itemAmount, receiptCurrency, categoryCurrency, when.getTime()),
        receiptId,
        tagIds: tagIdsFor(item.defKey),
        createdAt: now,
        updatedAt: now,
      })
    }

    newReceipts.push({
      id: receiptId,
      ownerId,
      merchant: t(spec.merchantKey),
      date: baseWhen.getTime(),
      currency: receiptCurrency,
      accountId,
      createdAt: now,
      updatedAt: now,
    })
  }

  // A plausible starting point for the Budget section (see
  // views/BudgetDataView.vue) — otherwise it'd be completely empty on first
  // look. Anchored to last month's ACTUAL demo spend/income above (rounded to
  // a "human-picked" figure, nudged up or down a bit) rather than a made-up
  // number, so it lines up with what the page's own ring/progress actually
  // shows. Roughly half the categories also get THIS month's budget already
  // set, so the page demonstrates both states right away: some categories
  // already tracked, others offering last month's amount to copy over.
  const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1).getTime()
  const prevMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999).getTime()
  const prevMonthKey = monthKeyFromTimestamp(prevMonthStart)
  const currentMonthKey = monthKeyFromTimestamp(today.getTime())

  const prevMonthActual: Record<string, number> = {}
  for (const tx of newTransactions) {
    if (tx.date < prevMonthStart || tx.date > prevMonthEnd) continue
    if (tx.type !== 'expense' && tx.type !== 'income') continue
    if (!tx.categoryId) continue
    // `toAmount` already holds the category-currency amount (see its own
    // comment above, near accountCurrency) — falls back to `amount` only for
    // the rare row where conversion wasn't needed and it wasn't computed.
    prevMonthActual[tx.categoryId] = (prevMonthActual[tx.categoryId] ?? 0) + (tx.toAmount ?? tx.amount)
  }

  const newBudgets: Budget[] = []
  const budgetCategories = [...EXPENSE_SPECS, ...INCOME_SPECS]
    .map((spec) => byDef(defByKey(spec.defKey)))
    .filter((c): c is Category => !!c)

  for (const category of budgetCategories) {
    const actual = prevMonthActual[category.id]
    if (!actual) continue
    const categoryCurrency = resolveCategoryCurrency(category, settings.baseCurrency)
    const prevAmount = roundToNiceAmount(actual * randFloat(0.9, 1.15))
    newBudgets.push({
      id: newId(),
      ownerId,
      categoryId: category.id,
      amount: prevAmount,
      currency: categoryCurrency,
      period: 'monthly',
      month: prevMonthKey,
      createdAt: now,
    })

    if (Math.random() < 0.5) {
      const curAmount = Math.random() < 0.7 ? prevAmount : roundToNiceAmount(prevAmount * randFloat(0.9, 1.15))
      newBudgets.push({
        id: newId(),
        ownerId,
        categoryId: category.id,
        amount: curAmount,
        currency: categoryCurrency,
        period: 'monthly',
        month: currentMonthKey,
        createdAt: now,
      })
    }
  }

  await putAndQueue('transactions', ownerId, newTransactions)
  await putAndQueue('receipts', ownerId, newReceipts)
  await putAndQueue('budgets', ownerId, newBudgets)
}
