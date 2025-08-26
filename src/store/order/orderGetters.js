export default {
  isToAmount(state) {
    const isNotNullFromAccountId = !!state.order.from_account_id?.currency
    const isNotNullToAccountId = !!state.order.to_account_id?.currency
    const isNotEqualCurrency =
      state.order.from_account_id?.currency !== state.order.to_account_id?.currency
    return isNotNullFromAccountId && isNotNullToAccountId && isNotEqualCurrency
  },
}
