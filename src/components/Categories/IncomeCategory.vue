<template>
  <!-- <q-card class="my-card"> -->
    <q-card-section>
      <q-btn
        label="Створити категорію витрат"
        @click="openCreate"
      />
    </q-card-section>
    <q-card-section>
      <UIUniwersalItem
        v-for="category in accountStore.income"
        :key="category.id"
        :fromAccountColor="category.color"
        :fromAccountIcon="category.icon"
        :fromName="category.name"
        :fromAmount="category.balance"
        :fromAccountCurrency="category.currency"
        :typeId="1"
        @click="openUpdate(category)"
      />
    </q-card-section>
    <CategoriesCategoryCreate
      v-model:modelValue="createPopup"
      :category="categoryEdit"
      @closeCreate="closeCreate"
      @confirmCreate="confirmCreate"
    />
    <q-card-section v-if="accountStore.incomeArchive.length">
      <q-expansion-item
        v-model="isExpansion"
        icon="sym_o_archive"
        label="Архів"
        header-class="text-h6"
      >
        <UIUniwersalItem
          v-for="category in accountStore.incomeArchive"
          :key="category.id"
          :fromAccountColor="category.color"
          :fromAccountIcon="category.icon"
          :fromName="category.name"
          :fromAmount="category.balance"
          :fromAccountCurrency="category.currency"
          :typeId="1"
          @click="openUpdate(category)"
        />
      </q-expansion-item>
    </q-card-section>
  <!-- </q-card> -->
</template>

<script setup>
  import { onMounted, ref } from 'vue'
  import { useAccountStore } from '@/store/account'

  const accountStore = useAccountStore()
  const createPopup = ref(false)
  const isExpansion = ref(false)
  const categoryEdit = ref({})

  const openUpdate = (category) => {
    categoryEdit.value = { ...category }
    createPopup.value = true
  }

  const openCreate = () => {
    categoryEdit.value = {}
    createPopup.value = true
  }

  const closeCreate = () => {
    createPopup.value = false
    categoryEdit.value = {}
  }

  const confirmCreate = async (emit) => {
    if (emit.id) {
      await accountStore.categoryUpdate(emit)
    } else {
      await accountStore.categoryCreate(4, emit)
    }
    accountStore.accountGetMy()
    closeCreate()
  }
</script>

<style scoped></style>
