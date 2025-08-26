<template>
  <UITheLogin v-if="!userStore.user" />
  <div
    v-else
    class="grid__conteiner"
  >
    <header class="conteiner__header bg-primary text-white">
      <q-toolbar>
        <q-btn
          flat
          @click="drawerLeft = !drawerLeft"
          round
          dense
        >
          <UIMyIcon icon="mdi:menu" />
        </q-btn>
        <q-toolbar-title>2Money</q-toolbar-title>
        <q-toolbar-title align="right">
          <img
            width="30"
            height="30"
            :src="`data:image/png;base64, ${userStore?.getInfoResult?.photo}`"
          />
        </q-toolbar-title>
      </q-toolbar>
    </header>
    <main class="conteiner__main">
      <div></div>
      <div
        class="main__menu"
        :style="{ width: drawerLeft ? '250px' : '60px' }"
      >
        <q-item
          v-for="menuItem in menuItems"
          clickable
          v-ripple
          :active="$route.path === menuItem.to"
          @click="routerPush(menuItem.to)"
        >
          <q-item-section avatar>
            <UIMyIcon :icon="menuItem.icon" />
          </q-item-section>
          <q-item-section> {{ menuItem.label }} </q-item-section>
        </q-item>
      </div>

      <RouterView v-slot="{ Component }">
        <Transition
          name="fade"
          mode="out-in"
        >
          <Component
            :is="Component"
            class="main__component"
          />
        </Transition>
      </RouterView>
    </main>
  </div>
</template>

<script setup>
  import { ref } from 'vue'
  import { useRouter } from 'vue-router'
  import { useUserStore } from '@/store/user'

  const router = useRouter()
  const userStore = useUserStore()
  const drawerLeft = ref(false)

  const menuItems = [
    { icon: 'mdi:wallet-outline', label: 'Рахунки', to: '/wallet' },
    { icon: 'mdi:chart-donut', label: 'Категорії', to: '/categories' },
    { icon: 'mdi:bank-minus', label: 'Витрати', to: '/expenses' },
    { icon: 'mdi:wallet-plus-outline', label: 'Доходи', to: '/income' },
    { icon: 'mdi:transfer', label: 'Перекази', to: '/transfer' },
    { icon: 'mdi:monitor-dashboard', label: 'Всі операції', to: '/monitoring' },
  ]
  const routerPush = (to) => {
    router.push(to)
    drawerLeft.value = false
  }
</script>

<style scoped lang="scss">
  .grid__conteiner {
    position: relative;
    display: grid;
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
    overflow: hidden;
    height: 100dvh;
  }

  // .conteiner__header {
  // }

  .conteiner__main {
    position: relative;
    display: grid;
    grid-template-columns: 65px 1fr;
    height: 100%;
    @include overflow(none);
  }

  .main__menu {
    position: absolute;
    top: 0px;
    left: 0px;
    z-index: 100;
    width: 300px;
    background-color: #fff;
    box-shadow: 0px 0px 4px 1px #00000033;
    height: inherit;
    @include overflow(y);
    @include transition();
  }

  .main__component {
    @include overflow();
  }

  .menu__label {
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    font-size: 14px;
    @include lineClamp(1);
  }
</style>
