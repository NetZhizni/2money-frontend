<template>
  <div class="transactions-list">
    <div class="date-group">
      <TransactionDate
        v-for="day in dayTransactions"
        :dateValue="day.dateValue"
        :total="day.total"
      >
        <TransactionItem
          v-for="item in day.transactions"
          :key="item.id"
          :title="item.title"
          :amount="item.amount"
          :icon="item.icon"
          :icon_to="item.icon_to"
          :color="item.color"
          :title_to="item.title_to"
          :type="item.type"
          @click="openEditor(item)"
        />
      </TransactionDate>
      <UIMyPopup
        popupType="max"
        :modelValue="isOpenTransactionEditor"
        title="Редагування"
        btnCancelLabel="Скасувати"
        :btnCancelDisabled="false"
        :btnCancelLoading="false"
        @confirm="closeEditor"
        btnConfirmLabel="Зберегти"
        :btnConfirmDisabled="false"
        :btnConfirmLoading="false"
        @cancel="closeEditor"
        @close="closeEditor"
      >
      </UIMyPopup>
    </div>
    <UIMyAdd />
  </div>
</template>

<script setup>
  import { ref } from 'vue'
  const dayTransactions = [
    {
      dateValue: '2019-06-30T00:00:00.000Z',
      total: '7 942,11 ₴',
      transactions: [
        {
          id: 1,
          title: 'Дозвілля (Алкоголь)',
          icon: 'money',
          color: 'red',
          title_to: 'Дозвілля (Алкоголь)1111',
          icon_to: 'money',
          amount: '91 ₴',
          type: 'expense',
        },
        {
          id: 2,
          title: 'Дозвілля (Алкоголь)',
          icon: 'account',
          color: 'red',
          title_to: 'Дозвілля (Алкоголь)1111',
          icon_to: 'money',
          amount: '91 ₴',
          type: 'income',
        },
        {
          id: 3,
          title: 'Дозвілля (Алкоголь)',
          icon: 'account',
          color: 'red',
          title_to: 'Дозвілля (Алкоголь)1111',
          icon_to: 'money',
          amount: '91 ₴',
          type: 'neutral',
        },
        {
          id: 4,
          title: 'Дозвілля (Алкоголь)',
          icon: 'account',
          color: 'red',
          title_to: 'Дозвілля (Алкоголь)1111',
          icon_to: 'money',
          amount: '91 ₴',
          type: 'expense',
        },
        {
          id: 5,
          title: 'Дозвілля (Алкоголь)',
          icon: 'account',
          color: 'red',
          title_to: 'Дозвілля (Алкоголь)1111',
          icon_to: 'money',
          amount: '91 ₴',
          type: 'income',
        },
        {
          id: 6,
          title: 'Дозвілля (Алкоголь)',
          icon: 'account',
          color: 'red',
          title_to: 'Дозвілля (Алкоголь)1111',
          icon_to: 'money',
          amount: '91 ₴',
          type: 'expense',
        },
        {
          id: 7,
          title: 'Дозвілля (Алкоголь)',
          icon: 'account',
          color: 'red',
          title_to: 'Дозвілля (Алкоголь)1111',
          icon_to: 'money',
          amount: '91 ₴',
          type: 'neutral',
        },
      ],
    },
    {
      dateValue: '2019-06-29T00:00:00.000Z',
      total: '10 942,11 ₴',
      transactions: [
        {
          id: 1,
          title: 'Дозвілля (Алкоголь)',
          icon: 'money',
          color: 'red',
          title_to: 'Дозвілля (Алкоголь)1111',
          icon_to: 'money',
          amount: '91 ₴',
          type: 'expense',
        },
        {
          id: 2,
          title: 'Дозвілля (Алкоголь)',
          icon: 'account',
          color: 'red',
          title_to: 'Дозвілля (Алкоголь)1111',
          icon_to: 'money',
          amount: '91 ₴',
          type: 'income',
        },
        {
          id: 3,
          title: 'Дозвілля (Алкоголь)',
          icon: 'account',
          color: 'red',
          title_to: 'Дозвілля (Алкоголь)1111',
          icon_to: 'money',
          amount: '91 ₴',
          type: 'neutral',
        },
        {
          id: 4,
          title: 'Дозвілля (Алкоголь)',
          icon: 'account',
          color: 'red',
          title_to: 'Дозвілля (Алкоголь)1111',
          icon_to: 'money',
          amount: '91 ₴',
          type: 'expense',
        },
        {
          id: 5,
          title: 'Дозвілля (Алкоголь)',
          icon: 'account',
          color: 'red',
          title_to: 'Дозвілля (Алкоголь)1111',
          icon_to: 'money',
          amount: '91 ₴',
          type: 'income',
        },
        {
          id: 6,
          title: 'Дозвілля (Алкоголь)',
          icon: 'account',
          color: 'red',
          title_to: 'Дозвілля (Алкоголь)1111',
          icon_to: 'money',
          amount: '91 ₴',
          type: 'expense',
        },
        {
          id: 7,
          title: 'Дозвілля (Алкоголь)',
          icon: 'account',
          color: 'red',
          title_to: 'Дозвілля (Алкоголь)1111',
          icon_to: 'money',
          amount: '91 ₴',
          type: 'neutral',
        },
      ],
    },
    {
      dateValue: '2019-06-27T00:00:00.000Z',
      total: '80 942,11 ₴',
      transactions: [
        {
          id: 1,
          title: 'Дозвілля (Алкоголь)',
          icon: 'money',
          color: 'red',
          title_to: 'Дозвілля (Алкоголь)1111',
          icon_to: 'money',
          amount: '91 ₴',
          type: 'expense',
        },
        {
          id: 2,
          title: 'Дозвілля (Алкоголь)',
          icon: 'account',
          color: 'red',
          title_to: 'Дозвілля (Алкоголь)1111',
          icon_to: 'money',
          amount: '91 ₴',
          type: 'income',
        },
        {
          id: 3,
          title: 'Дозвілля (Алкоголь)',
          icon: 'account',
          color: 'red',
          title_to: 'Дозвілля (Алкоголь)1111',
          icon_to: 'money',
          amount: '91 ₴',
          type: 'neutral',
        },
        {
          id: 4,
          title: 'Дозвілля (Алкоголь)',
          icon: 'account',
          color: 'red',
          title_to: 'Дозвілля (Алкоголь)1111',
          icon_to: 'money',
          amount: '91 ₴',
          type: 'expense',
        },
        {
          id: 5,
          title: 'Дозвілля (Алкоголь)',
          icon: 'account',
          color: 'red',
          title_to: 'Дозвілля (Алкоголь)1111',
          icon_to: 'money',
          amount: '91 ₴',
          type: 'income',
        },
        {
          id: 6,
          title: 'Дозвілля (Алкоголь)',
          icon: 'account',
          color: 'red',
          title_to: 'Дозвілля (Алкоголь)1111',
          icon_to: 'money',
          amount: '91 ₴',
          type: 'expense',
        },
        {
          id: 7,
          title: 'Дозвілля (Алкоголь)',
          icon: 'account',
          color: 'red',
          title_to: 'Дозвілля (Алкоголь)1111',
          icon_to: 'money',
          amount: '91 ₴',
          type: 'neutral',
        },
      ],
    },
  ]

  const isOpenTransactionEditor = ref(false)
  const selectTransaction = ref(null)

  const openEditor = (item) => {
    selectTransaction.value = item
    isOpenTransactionEditor.value = true
  }

  const closeEditor = () => {
    selectTransaction.value = null
    isOpenTransactionEditor.value = false
  }
</script>

<style scoped>
  .transactions-list {
    flex: 1;
    overflow-y: auto;
    padding: 15px; /* bottom padding for FAB */
    background-color: #ffffff;
    padding-bottom: 70px;
  }

  .date-group {
    margin-top: 15px;
  }
</style>
