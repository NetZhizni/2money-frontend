<template>
  <q-card class="my-card">
    <q-card-section>
      <div class="text-h6">Рахунки</div>
    </q-card-section>
    <q-card-section v-if="accountStore.invoicesBalance.length">
      <UIUniwersalItem
        v-for="account in accountStore.invoicesBalance"
        :key="account.id"
        :fromAccountColor="account.color"
        :fromAccountIcon="account.icon"
        :fromName="account.name"
        :fromAmount="account.balance"
        :fromAccountCurrency="account.currency"
        :typeId="1"
        @click="openUpdate(account)"
      />
    </q-card-section>
    <q-card-section>
      <q-btn
        label="Створити рахунок"
        @click="openCreate"
      />
      <WalletCreate
        v-model:modelValue="createPopup"
        :account="accountEdit"
        @closeCreate="closeCreate"
        @confirmCreate="confirmCreate"
      />
    </q-card-section>
  </q-card>
</template>

<script setup>
  import { ref } from 'vue'
  import { useAccountStore } from '@/store/account'

  const accountStore = useAccountStore()
  const createPopup = ref(false)
  const accountEdit = ref({})

  const openUpdate = (account) => {
    accountEdit.value = { ...account }
    createPopup.value = true
  }

  const openCreate = () => {
    accountEdit.value = {}
    createPopup.value = true
  }

  const closeCreate = () => {
    createPopup.value = false
    accountEdit.value = {}
  }

  const confirmCreate = async (emit) => {
    if (emit.id) {
      await accountStore.accountUpdate(emit)
    } else {
      await accountStore.accountCreate(1, emit)
    }
    accountStore.accountGetMyWallets()
    closeCreate()
  }
</script>

<style lang="scss" scoped>
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
