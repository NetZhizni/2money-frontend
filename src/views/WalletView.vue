<template>
  <div>
    <WalletInvoicesBalance />
    <WalletSavingsBalance />
    <WalletDebtsBalance />
    <WalletArchiveBalance />
  </div>
</template>

<script setup>
  import { onMounted } from 'vue'
  import { useAccountStore } from '@/store/account'
  import { useTransactionStore } from '@/store/transaction'

  const accountStore = useAccountStore()
  const transactionStore = useTransactionStore()

  onMounted(async () => {
    await Promise.allSettled([
      accountStore.accountGetMy(),
      transactionStore.transactionGetMy(),
    ])
  })
</script>

<style scoped>
  .my-card {
    margin: 8px;
  }

  .conteiner__icon {
    position: relative;
    width: 40px;
    height: 40px;
    display: flex;
    justify-content: center;
    align-items: center;
  }
  .icon__shadow {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    opacity: 0.2;
    border-radius: 8px;
  }
</style>
