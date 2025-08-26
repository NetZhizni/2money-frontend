<script setup>
  import { computed, ref } from 'vue'

  const props = defineProps({
    modelValue: { type: Object, required: true, default: () => ({}) },
    icon: { type: String, required: false, default: 'currency-usd' },
    color: { type: String, required: false, default: 'white' },
    name: { type: String, required: false, default: 'Готівка' },
    label: { type: String, required: false, default: 'З відки' },
    typeId: { type: [Number, String], required: false, default: 3 },
    options: { type: Array, required: true, default: () => [] },
    secondOptions: { type: Array, required: false, default: () => [] },
  })
  const emit = defineEmits({
    'update:modelValue': (value) => typeof value === 'object',
  })

  const isOpenPopup = ref(false)
  const closeCreate = () => {
    isOpenPopup.value = false
  }
  const confirmCreate = (option) => {
    emit('update:modelValue', option)
    closeCreate()
  }

  const secondOptionsGroup = computed(() => {
    const groupedData = {}
    props.secondOptions?.forEach((item) => {
      // Створюємо ключ
      const key = `${item.last_name} ${item.first_name}`
      // Додаємо об'єкт до відповідного ключа у згрупованих даних
      if (!groupedData[key]) groupedData[key] = []
      groupedData[key].push(item)
    })
    return groupedData
  })
</script>

<template>
  <div
    class="container__bill"
    @click="isOpenPopup = true"
  >
    <div
      class="bill__background"
      :style="{ backgroundColor: props.modelValue.color }"
    ></div>
    <div>
      <div class="bill__label">{{ props.label }}</div>
      <div class="bill__name">{{ props.modelValue.name }}</div>
    </div>
    <UIColorIcon
      :icon="props.modelValue.icon"
      :color="props.modelValue.color"
      size="40px"
    />
  </div>
  <UIMyPopup
    v-model:modelValue="isOpenPopup"
    popupType="medium"
    :title="props.label"
    @close="closeCreate"
  >
    <UIUniwersalItem
      v-for="option in props.options"
      :key="option.id"
      :fromName="option.name"
      :fromAccountColor="option.color"
      :fromAccountIcon="option.icon"
      :fromAccountCurrency="option.currency"
      :fromAmount="option.balance"
      :typeId="props.typeId"
      @click="confirmCreate(option)"
    />
    <div v-if="props.secondOptions.length">
      <UIListTransactions
        v-for="(secondOptions, key) in secondOptionsGroup"
        :key="key"
        :month-year="key"
      >
        <UIUniwersalItem
          v-for="option in secondOptions"
          :key="option.id"
          :fromName="option.name"
          :fromAccountColor="option.color"
          :fromAccountIcon="option.icon"
          :fromAccountCurrency="option.currency"
          :fromAmount="option.balance"
          :typeId="props.typeId"
          @click="confirmCreate(option)"
        />
      </UIListTransactions>
    </div>
  </UIMyPopup>
</template>

<style scoped lang="scss">
  .container__bill {
    position: relative;
    margin-top: 20px;
    padding: 8px;
    position: relative;
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 4px;
    border-radius: 8px;
    border: 1px solid #ddd;
    cursor: pointer;
  }

  .bill__background {
    position: absolute;
    top: 0px;
    left: 0px;
    width: 100%;
    height: 100%;
    border-radius: 8px;
    opacity: 0.2;
  }

  .bill__label {
    font-size: 14px;
    height: 22px;
  }
  .bill__name {
    font-size: 18px;
    height: 28px;
  }
</style>
