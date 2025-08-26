<template>
  <div class="icon__picker">
    <q-input
      v-model="search"
      placeholder="Пошук іконки..."
      class="search__input"
      hint="Відображено перші 250 іконок"
    />
    <div class="icon__grid">
      <div
        v-for="icon in filteredIcons"
        :key="icon"
        class="icon__circle"
        @click="emit('update:select', icon)"
      >
        <Icon
          :icon="`mdi:${icon}`"
          width="40"
          height="40"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
  import { Icon } from '@iconify/vue'
  import mdi from '@iconify/json/json/mdi.json'
  import { ref, computed } from 'vue'

  const props = defineProps({
    select: { type: String, required: false, default: null },
  })
  const emit = defineEmits({
    'update:select': (value) => typeof value === 'string',
  })

  const search = ref('')
  const icons = Object.keys(mdi.icons) // масив назв іконок без префіксу mdi:

  const filteredIcons = computed(() => {
    if (!search.value) return icons.slice(0, 250)
    return icons
      .filter((name) => name.toLowerCase().includes(search.value.toLowerCase()))
      .slice(0, 250)
  })
</script>

<style lang="scss" scoped>
  .icon__picker {
    padding: 8px;
    display: grid;
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
    gap: 8px;
    height: 100%;
    align-items: center;
    @include overflow(none);
  }

  .search__input {
    width: 100%;
  }

  .icon__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, 80px);
    justify-content: center;
    align-content: start;
    height: 100%;
    gap: 8px;
    @include overflow(y);
  }

  .icon__circle {
    width: 80px;
    height: 80px;
    background: rgba(10, 10, 10, 0.1);
    color: #444746;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
</style>
