export interface BudgetProgress {
  pct: number // 0..100, rounded and clamped
  over: boolean
  spent: number
  amount: number
}

/** Progress of `spent` against a monthly budget limit, or null when there's no (valid) budget set. */
export function budgetProgress(spent: number, budgetAmount: number | undefined | null): BudgetProgress | null {
  if (!budgetAmount || budgetAmount <= 0) return null
  return {
    pct: Math.min(100, Math.round((spent / budgetAmount) * 100)),
    over: spent > budgetAmount,
    spent,
    amount: budgetAmount,
  }
}
