<script setup>
  import { onMounted, onBeforeUnmount, onBeforeMount } from 'vue'
  import { useUserStore } from '@/store/user'

  const userStore = useUserStore()

  onBeforeMount(() => {
    userStore.onAuthStateChanged()
  })

  onMounted(() => {
    document.addEventListener('touchmove', preventPinch, { passive: false }) // Блокуємо pinch-zoom
    document.addEventListener('touchend', preventDoubleTap, false) // Блокуємо double-tap zoom
  })

  onBeforeUnmount(() => {
    document.removeEventListener('touchmove', preventPinch)
    document.removeEventListener('touchend', preventDoubleTap)
  })

  function preventPinch(e) {
    if (e.scale !== undefined && e.scale !== 1) {
      e.preventDefault()
    }
  }

  let lastTouchEnd = 0
  function preventDoubleTap(e) {
    const now = new Date().getTime()
    if (now - lastTouchEnd <= 200) {
      e.preventDefault()
    }
    lastTouchEnd = now
  }
</script>

<template>
  <UISpinnerLoad v-if="userStore.isLoading" />
  <UITheLogin v-else-if="!userStore.user" />
  <RouterView v-else />
</template>

<style></style>
