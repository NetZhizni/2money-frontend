<template>
  <q-color
    no-header
    no-footer
    default-view="palette"
    flat
    class="picker__my"
    :modelValue="props.select"
    @update:modelValue="emit('update:select', $event)"
  />
</template>

<script setup>
  const props = defineProps({
    select: { type: String, required: false, default: null },
  })
  const emit = defineEmits({
    'update:select': (value) => typeof value === 'string',
  })
</script>

<style lang="scss" scoped>
  .picker__my {
    height: 100%;
    width: 100%;
    max-width: 100%;
    @include overflow(y);
  }
</style>
