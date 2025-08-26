<template>
  <q-card class="my-card">
    <q-card-section>
      <div class="text-h6">Витрати</div>
    </q-card-section>
    <q-card-section>
      <q-btn
        label="Створити витрату"
        @click="isOpenPopup = !isOpenPopup"
      />
    </q-card-section>
    <UIListTransactions
      v-for="(transactions, monthYear) in transactionStore.transactionExpensesGrouped"
      :key="monthYear"
      :month-year="monthYear"
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
        @click="openEdit(transaction)"
      />
    </UIListTransactions>
    <UIMyPopup
      v-model:modelValue="isOpenPopup"
      popupType="medium"
      btnCancelLabel="Відмінити"
      :btnConfirmLabel="order?.id ? 'Оновити' : 'Створити'"
      :title="order?.id ? 'Редагувати' : 'Транзакція'"
      @confirm="confirmCreate"
      @cancel="closeCreate"
      @close="closeCreate"
    >
      <div class="my__card">
        <div class="card__bull">
          <Bill
            v-model="orderStore.order.from_account_id"
            label="З відки"
            typeId="1"
            :options="accountStore.activeBalance"
          />
          <Bill
            v-model="orderStore.order.to_account_id"
            label="Куди"
            typeId="2"
            :options="accountStore.expenses"
          />
        </div>
        <AmountEditor
          v-model:modelValue="orderStore.order.from_amount"
          :currency="orderStore.order.from_account_id?.currency"
          label="Сума"
        />
        <AmountEditor
          v-if="orderStore.isToAmount"
          v-model:modelValue="orderStore.order.to_amount"
          :currency="orderStore.order.to_account_id?.currency"
          label="Сума у вальюті"
        />
        <DatePicker
          v-model:modelValue="orderStore.order.date"
          label="Дата"
        />
        <q-input
          v-model="orderStore.order.comment"
          label="Опис"
        />
      </div>
    </UIMyPopup>
  </q-card>
</template>

<script setup>
  import { onMounted, ref } from 'vue'
  import { useAccountStore } from '@/store/account'
  import { useOrderStore } from '@/store/order'
  import { useTransactionStore } from '@/store/transaction'
  import operationTypeId from '@/helpers/operationTypeId'

  const accountStore = useAccountStore()
  const transactionStore = useTransactionStore()
  const orderStore = useOrderStore()
  const order = ref({})
  const isOpenPopup = ref(false)

  const transactionCreate = async (orderSelect) => {
    await transactionStore.transactionCreate({
      date: orderSelect.date,
      operation_type_id: operationTypeId(
        orderSelect.from_account_id.account_type_id,
        orderSelect.to_account_id.account_type_id,
      ),
      from_account_id: orderSelect.from_account_id.id,
      from_amount: orderSelect.from_amount,
      to_account_id: orderSelect.to_account_id.id,
      to_amount: orderStore.isToAmount ? orderSelect.to_amount : orderSelect.from_amount,
      comment: orderSelect.comment,
    })
  }

  const transactionUpdate = async (orderSelect) => {
    await transactionStore.transactionUpdate({
      id: orderSelect.id,
      date: orderSelect.date,
      operation_type_id: orderSelect.operation_type_id,
      from_account_id: orderSelect.from_account_id.id,
      from_amount: orderSelect.from_amount,
      to_account_id: orderSelect.to_account_id.id,
      to_amount: orderStore.isToAmount ? orderSelect.to_amount : orderSelect.from_amount,
      comment: orderSelect.comment,
    })
  }

  const openEdit = (transaction) => {
    orderStore.order = {
      id: transaction.id,
      date: transaction.date,
      operation_type_id: transaction.operation_type_id,
      from_amount: transaction.from_amount,
      from_account_id: {
        id: transaction.from_account_id,
        color: transaction.from_account_color,
        name: transaction.from_account_name,
        icon: transaction.from_account_icon,
        currency: transaction.from_account_currency,
      },
      to_amount: transaction.to_amount,
      to_account_id: {
        id: transaction.to_account_id,
        color: transaction.to_account_color,
        name: transaction.to_account_name,
        icon: transaction.to_account_icon,
        currency: transaction.to_account_currency,
      },
      comment: transaction.comment,
    }
    isOpenPopup.value = true
  }

  const confirmCreate = async () => {
    if (orderStore.order.id) {
      await transactionUpdate(orderStore.order)
    } else {
      await transactionCreate(orderStore.order)
    }
    await transactionStore.transactionGetMy()
    closeCreate()
  }
  const closeCreate = () => {
    isOpenPopup.value = false
    orderStore.order = {}
  }

  onMounted(async () => {
    await Promise.allSettled([
      accountStore.accountGetMy(),
      transactionStore.transactionGetMy(),
    ])
  })
</script>

<style scoped>
  .my__card {
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
  }
  .card__bull {
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-items: start;
    gap: 2px;
  }

  .my-card {
    margin: 8px;
  }
</style>
