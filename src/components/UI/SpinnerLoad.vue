<template>
  <div class="spin__center">
    <q-spinner
      color="primary"
      size="75px"
      :thickness="3"
    />
  </div>
</template>

<style lang="scss" scoped>
  .spin__center {
    display: flex;
    justify-content: center;
    align-items: center;
    position: relative;
    width: 100%;
    height: 100%;
  }
</style>
