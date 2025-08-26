<template>
  <UIMyPopup
    popupType="medium"
    btnCancelLabel="Відмінити"
    :btnConfirmLabel="props.account.id ? 'Оновити' : 'Створити'"
    :modelValue="props.modelValue"
    :title="props.account.id ? props.account.name : 'Створити рахунок'"
    @confirm="confirmCreate"
    @cancel="closeCreate"
    @close="closeCreate"
  >
    <div class="dialog__body">
      <IconEditor
        v-model:color="create.color"
        v-model:icon="create.icon"
      />
      <q-input
        outlined
        label="Назва рахунку"
        v-model:modelValue="create.name"
      />
      <q-select
        v-if="!props.account.id"
        outlined
        label="Валюта"
        v-model:modelValue="create.currency"
        hide-dropdown-icon
        option-label="code"
        option-value="code"
        emit-value
        :options="[
          { code: 'UAH', numericCode: 980, name: 'Українська гривня' },
          { code: 'USD', numericCode: 840, name: 'Долар США' },
          { code: 'EUR', numericCode: 978, name: 'Євро' },
          { code: 'GBP', numericCode: 826, name: 'Фунт стерлінгів Велико­британії' },
          { code: 'JPY', numericCode: 392, name: 'Японська єна' },
          { code: 'CHF', numericCode: 756, name: 'Швейцарський франк' },
          { code: 'CNY', numericCode: 156, name: 'Китайський юань женьмiньбi' },
        ]"
        @popup-show="console.log('showPopup')"
        @popup-hide="console.log('hidePopup')"
      >
        <template v-slot:append>
          <UIMyIcon icon="mdi:chevron-down" />
        </template>
      </q-select>
      <q-toggle
        v-if="props.account.id"
        v-model:modelValue="create.is_archive"
        label="Aрхівний"
      />
    </div>
  </UIMyPopup>
</template>

<script setup>
  import { ref, watch } from 'vue'

  const props = defineProps({
    modelValue: { type: Boolean, required: true, default: false },
    account: { type: Object, required: false, default: () => ({}) },
  })
  const emit = defineEmits({
    'update:modelValue': (value) => typeof value === 'string',
    closeCreate: (value) => typeof value === 'object',
    confirmCreate: (value) => typeof value === 'object',
  })

  const create = ref({})

  const confirmCreate = () => {
    emit('confirmCreate', create.value)
  }
  const closeCreate = () => {
    emit('closeCreate', create.value)
  }
  watch(
    () => props.modelValue,
    (value) => {
      if (value) {
        create.value = { ...props.account }
      } else {
        create.value = {}
      }
    },
  )
</script>

<style scoped>
  .dialog__body {
    display: grid;
    gap: 8px;
  }
</style>
