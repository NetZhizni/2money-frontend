<template>
  <div class="content-scroll">
    <AccountGroup
      v-for="group in accountStore.accountGroups"
      :key="group.name"
      :name="group.name"
      :total="group.total"
    >
      <AccountItem
        v-for="account in group.accounts"
        :key="account.id"
        :name="account.name"
        :balance="account.balance"
        :icon="account.icon"
        :color="account.color"
        :currency="account.currency"
        :currency_display="account.currency_display"
        @click="openEdit(account)"
      />
    </AccountGroup>
    <UIMyAdd @click="openCreate" />
    <UIMyPopup
      :modelValue="isOpenEdit"
      title="Редагування рахунку"
      btnCancelLabel="Скасувати"
      :btnCancelDisabled="false"
      :btnCancelLoading="false"
      @confirm="saveEdit"
      btnConfirmLabel="Зберегти"
      :btnConfirmDisabled="false"
      :btnConfirmLoading="false"
      @cancel="closeEdit"
      @close="closeEdit"
    >
      <IconEditor
        v-model:icon="editItem.icon"
        v-model:color="editItem.color"
      />
      <AmountEditor
        v-model="editItem.balance"
        :currency="editItem.currency"
        :currency_display="editItem.currency_display"
        :label="''"
      />
      <q-input
        v-model="editItem.name"
        label="Назва"
        :options="accountStore.currency"
      />
      <q-select
        v-model="editItem.currency"
        label="Валюта"
        :options="accountStore.currency"
        readonly
      />
      <q-select
        v-model="editItem.currency_display"
        label="Відображення валюти"
        emit-value
        map-options
        :options="accountStore.currency_display"
      />
      <q-select
        v-model="editItem.account_type_id"
        label="Тип рахунку"
        emit-value
        map-options
        :options="accountStore.account_type_id"
      />
      <q-toggle
        v-model="editItem.is_active"
        label="Активний"
      />
    </UIMyPopup>
    <UIMyPopup
      :modelValue="isOpenCreate"
      title="Створення рахунку"
      btnCancelLabel="Скасувати"
      :btnCancelDisabled="false"
      :btnCancelLoading="false"
      @confirm="saveCreate"
      btnConfirmLabel="Зберегти"
      :btnConfirmDisabled="false"
      :btnConfirmLoading="false"
      @cancel="closeCreate"
      @close="closeCreate"
    >
      <IconEditor
        v-model:icon="createItem.icon"
        v-model:color="createItem.color"
      />
      <q-input
        v-model="createItem.name"
        label="Назва"
        :options="accountStore.currency"
      />
      <q-select
        v-model="createItem.currency"
        label="Валюта"
        :options="accountStore.currency"
      />
      <q-select
        v-model="createItem.currency_display"
        label="Відображення валюти"
        emit-value
        map-options
        :options="accountStore.currency_display"
      />
      <q-select
        v-model="createItem.account_type_id"
        label="Тип рахунку"
        emit-value
        map-options
        :options="accountStore.account_type_id"
      />
    </UIMyPopup>
  </div>
</template>

<script setup>
  import { ref } from 'vue'
  import { useAccountStore } from '@/store/account'

  const accountStore = useAccountStore()

  const createItem = ref(null)
  const editItem = ref(null)
  const isOpenEdit = ref(false)
  const isOpenCreate = ref(false)

  const openEdit = (account) => {
    isOpenEdit.value = true
    editItem.value = { ...account }
  }
  const closeEdit = () => {
    isOpenEdit.value = false
    editItem.value = null
  }
  const saveEdit = () => {
    accountStore.updateAccount(editItem.value)
    closeEdit()
  }

  const openCreate = () => {
    isOpenCreate.value = true
    createItem.value = {
      id: new Date().getTime(),
      name: '',
      balance: 0,
      icon: 'wallet',
      color: 'green',
      currency: 'UAH',
      currency_display: 'symbol',
      account_type_id: 1,
      is_active: true,
    }
  }
  const closeCreate = () => {
    isOpenCreate.value = false
    createItem.value = null
  }
  const saveCreate = () => {
    accountStore.addAccount(createItem.value)
    closeCreate()
  }
</script>

<style scoped>
  .content-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    padding-bottom: 70px;
  }
</style>
