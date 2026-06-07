<template>
  <div class="app-container">
    <Header />
    <RouterView />
    <Footer />
  </div>
</template>

<script setup></script>

<style>
  .app-container {
    height: 100dvh;
    display: flex;
    flex-direction: column;
    min-height: 100dvh;
    background-color: #fafafa;
  }
</style>
