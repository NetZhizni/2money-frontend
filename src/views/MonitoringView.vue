<template>
  <q-card class="my-card">
    <q-card-section>
      <div class="text-h6">Всі операції</div>
    </q-card-section>
    <UIListTransactions
      v-for="(transactions, monthYear) in transactionStore.transactionGetMyResultGrouped"
      :key="monthYear"
      :month-year="monthYear"
      :amount="amount(transactions)"
    >
      <UIUniwersalItem
        v-for="transaction in transactions"
        :key="transaction.id"
        :fromName="transaction.from_account_name"
        :fromAmount="transaction.from_amount"
        :fromAccountCurrency="transaction.from_account_currency"
        :fromAccountColor="transaction.from_account_color"
        :fromAccountIcon="transaction.from_account_icon"
        :toName="transaction.to_account_name"
        :toAmount="transaction.to_amount"
        :toAccountCurrency="transaction.to_account_currency"
        :toAccountColor="transaction.to_account_color"
        :toAccountIcon="transaction.to_account_icon"
        :comment="transaction.comment"
        :typeId="operationTypeId(transaction.from_account_type_id, transaction.to_account_type_id)"
      />
    </UIListTransactions>
  </q-card>
</template>

<script setup>
  import { onMounted } from 'vue'
  import { useAccountStore } from '@/store/account'
  import { useTransactionStore } from '@/store/transaction'
  import operationTypeId from '@/helpers/operationTypeId'

  const accountStore = useAccountStore()
  const transactionStore = useTransactionStore()

  const amount = (transactions) => {
    const res = transactions.reduce((acc, curr) => {
      const typeId = operationTypeId(curr.from_account_type_id, curr.to_account_type_id)
      const accumulator = +acc
      const currentValue = +curr.from_amount
      if (typeId === 1) return accumulator + currentValue
      if (typeId === 2) return accumulator - currentValue
      return accumulator
    }, 0)
    return res
  }

  onMounted(async () => {
    await Promise.allSettled([
      accountStore.accountGetMy(),
      transactionStore.transactionGetMy(),
    ])
  })
</script>

<style scoped>
  .calculator {
    display: grid;
    grid-template-columns: 1fr;
    justify-content: start;
    align-content: start;
    gap: 2px;
  }

  .notes {
    width: 100%;
    padding: 12px;
    font-size: 16px;
    border: 1px solid #ddd;
    border-radius: 12px;
    margin-bottom: 12px;
    outline: none;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }

  .result {
    background: #f8f8f8;
    border: none;
    min-height: 62px;
    border-radius: 16px;
    font-size: 20px;
    padding: 16px;
    margin: 8px 0px;
    cursor: pointer;
    text-align: center;
    transition: background 0.2s;
  }

  .btn {
    background: #f8f8f8;
    border: none;
    border-radius: 16px;
    font-size: 20px;
    padding: 16px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .btn:active {
    background: #eee;
  }

  .equal {
    background: #3949ab;
    color: white;
    /* grid-column: 2 span ; */
    grid-row: span 4;
  }

  .my-card {
    margin: 8px;
  }
</style>
