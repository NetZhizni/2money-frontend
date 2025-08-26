<template>
  <div
    class="conteiner__icon"
    :style="{ width: props.size, height: props.size, 'font-size': props.size }"
  >
    <div
      class="icon__shadow"
      :style="{ 'background-color': props.color }"
    ></div>
    <Icon
      :style="{ color: props.color, 'font-size': '0.8em' }"
      :icon="`mdi:${props.icon}`"
    />
  </div>
</template>

<script setup>
  import { Icon } from '@iconify/vue'
  const props = defineProps({
    color: { type: String, required: false, default: '' },
    icon: { type: String, required: false, default: '' },
    size: { type: String, required: false, default: '40px' },
  })
</script>

<style scoped>
  .conteiner__icon {
    position: relative;
    display: flex;
    justify-content: center;
    align-items: center;
    border-radius: 0.2em;
  }

  .icon__shadow {
    border: 1px solid hsla(0, 0%, 50%, 0.2);
    position: absolute;
    top: 0px;
    left: 0px;
    right: 0px;
    bottom: 0px;
    opacity: 0.2;
    border-radius: 0.2em;
  }
</style>
