<template>
  <q-card>
    <q-tabs
      v-model="tab"
      class="text-grey"
      active-color="primary"
      indicator-color="primary"
      align="justify"
      narrow-indicator
    >
      <q-tab
        name="expenses"
        label="Витрати"
      />
      <q-tab
        name="income"
        label="Доходи"
      />
    </q-tabs>
    <q-separator />
    <q-tab-panels
      v-model="tab"
      animated
    >
      <q-tab-panel name="expenses">
        <CategoriesExpensesCategory />
      </q-tab-panel>
      <q-tab-panel name="income">
        <CategoriesIncomeCategory />
      </q-tab-panel>
    </q-tab-panels>
  </q-card>
</template>

<script setup>
  import { onMounted, ref } from 'vue'
  import { useAccountStore } from '@/store/account'
  import { useTransactionStore } from '@/store/transaction'

  const accountStore = useAccountStore()
  const transactionStore = useTransactionStore()
  const tab = ref('expenses')

  onMounted(async () => {
    await Promise.allSettled([
      accountStore.accountGetMy(),
      transactionStore.transactionGetMy(),
    ])
  })
</script>

<style scoped></style>
