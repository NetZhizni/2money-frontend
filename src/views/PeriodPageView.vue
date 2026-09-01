<script setup lang="ts">
  import PeriodSwitcher from '../components/layout/PeriodSwitcher.vue'
</script>

<template>
  <div class="view">
    <PeriodSwitcher />
    <div class="view-scroll">
      <div class="view-scroll-content">
        <RouterView />
      </div>
    </div>
  </div>
</template>

<style>

</style>
