<template>
  <footer class="bottom-nav">
    <BottomItem
      v-for="item in menuItems"
      :key="item.name"
      :icon="item.icon"
      :name="item.name"
      :isActive="router.currentRoute.value.path === item.to"
      @click="routerPush(item.to)"
    />
  </footer>
</template>

<script setup>
  import { useRouter } from 'vue-router'

  const router = useRouter()
  const menuItems = [
    { name: 'Рахунки', icon: 'wallet', to: '/accounts' },
    { name: 'Категорії', icon: 'chart-pie-outline', to: '/categories' },
    { name: 'Операції', icon: 'list-box-outline', to: '/transactions' },
    { name: 'Огляд', icon: 'chart-line', to: '/overview' },
  ]

  const routerPush = (to) => {
    router.push(to)
  }
</script>

<style scoped>
  /* Bottom Navigation */
  .bottom-nav {
    position: sticky;
    bottom: 0px;
    z-index: 100;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 15px;
    background-color: #fafafa;
    border-top: 1px solid #efefef;
  }
</style>
