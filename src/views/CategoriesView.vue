<template>
  <main class="main-content">
    <CategoryItem
      v-for="item in categoryItems"
      :key="item.name"
      :name="item.name"
      :amount="item.amount"
      :icon="item.icon"
      :color="item.color"
    />
  </main>
</template>

<script setup>
  // import { ref, defineProps, defineEmits } from 'vue'
  // const props = defineProps({
  //   modelValue: { type: String, required: true, default: '' },
  // })
  // const emit = defineEmits({
  //   'update:modelValue': (value) => typeof value === 'string',
  // })

  const categoryItems = [
    { name: 'Продукти', icon: 'food', amount: '0 ₴', color: '#5875b7' },
    { name: 'Робота', icon: 'drink', amount: '0 ₴', color: '#d75a81' },
    { name: 'Дозвілля', icon: 'ticket', amount: '0 ₴', color: '#c85a5a' },
    { name: 'Транспорт', icon: 'train', amount: '0 ₴', color: '#e7c961' },
    { name: 'Покупки', icon: 'shopping', amount: '0 ₴', color: '#8f7265' },
    { name: 'Одяг', icon: 'coat-hanger', amount: '0 ₴', color: '#7b8d99' },
    { name: 'Подарунки', icon: 'gift', amount: '0 ₴', color: '#d55d75' },
    { name: 'Настя', icon: 'user', amount: '0 ₴', color: '#5ab3c8' },
    { name: "Зв'язок", icon: 'globe', amount: '0 ₴', color: '#6db36e' },
    { name: 'Дім', icon: 'house', amount: '0 ₴', color: '#a0a5ad' },
    { name: 'Машина', icon: 'car', amount: '0 ₴', color: '#63a8e0' },
    { name: "Здоров'я", icon: 'medical-bag', amount: '0 ₴', color: '#84bd76' },
    { name: 'Корм', icon: 'paw', amount: '0 ₴', color: '#666666' },
    { name: 'Роздача', icon: 'hand-coin', amount: '0 ₴', color: '#666666' },
    { name: 'Виставон', icon: 'basket', amount: '0 ₴', color: '#666666' },
  ]
</script>

<style scoped>

    .main-content {
    overflow: scroll;
    flex: 1;
    padding: 20px 10px;
    background-color: #fcfcfc;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    grid-template-rows: repeat(5, 1fr);
    height: 100%;
    gap: 15px 5px;
    align-items: center;
    justify-items: center;
    position: relative;
  }

  /* Central Circle */
  .center-circle-container {
    grid-column: 2 / 4;
    grid-row: 2 / 4;
    width: 170px;
    height: 170px;
    border-radius: 50%;
    border: 12px solid #cac7cc;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    background-color: transparent;
    z-index: 10;
  }

  .center-title {
    font-size: 14px;
    color: #333;
    font-weight: 500;
    margin-bottom: 6px;
  }

  .center-val-red {
    color: #d6628a;
    font-size: 16px;
    margin-bottom: 4px;
  }

  .center-val-green {
    color: #88c7a3;
    font-size: 16px;
  }
</style>
