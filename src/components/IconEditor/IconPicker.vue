<template>
  <div class="icon-picker">
    <q-input
      v-model="search"
      placeholder="Пошук іконки..."
      class="icon-picker__search"
      hint="Відображено перші 250 іконок"
      clearable
      outlined
      dense
    />
    <div class="icon-picker__grid">
      <button
        v-for="icon in filteredIcons"
        :key="icon"
        class="icon-picker__item"
        :class="{ 'icon-picker__item--active': props.select === icon }"
        type="button"
        :aria-label="`Вибрати іконку ${icon}`"
        @click="emit('update:select', icon)"
      >
        <Icon
          :icon="`mdi:${icon}`"
          width="40"
          height="40"
        />
      </button>
    </div>
  </div>
</template>

<script setup>
  import { ref, computed, onBeforeMount } from 'vue'
  import { Icon } from '@iconify/vue'
  import mdi from '@iconify/json/json/mdi.json'

  const props = defineProps({
    select: { type: String, required: false, default: null },
  })
  const emit = defineEmits({
    'update:select': (value) => typeof value === 'string',
  })

  const limit = 250
  const search = ref('')
  const allIcons = Object.keys(mdi.icons)

  const filteredIcons = computed(() => {
    if (!search.value) return allIcons.slice(0, limit)
    const query = search.value.toLowerCase()
    return allIcons.filter((name) => name.toLowerCase().includes(query)).slice(0, limit)
  })
  onBeforeMount(() => {
    if (props.select) search.value = props.select
  })
</script>

<style lang="scss" scoped>
  .icon-picker {
    padding: 8px;
    display: grid;
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
    gap: 16px;
    height: 100%;
    align-items: center;
    @include overflow(none);

    &__search {
      width: 100%;
    }

    &__grid {
      display: grid;
      padding: 10px 0px;
      grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
      justify-content: center;
      justify-items: center;
      align-content: start;
      height: 100%;
      gap: 12px;
      @include overflow(y);
    }

    &__item {
      width: 80px;
      height: 80px;
      background: #0a0a0a0d;
      color: #444746;
      border-radius: 8px;
      border: 2px solid transparent; // Резервуємо місце під бордер активного стану
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      @include transition();

      &:hover {
        background: #0a0a0a1f;
        transform: scale(1.05); // Легкий ефект збільшення при наведенні
      }

      /* Стилізація активного (вибраного) елемента */
      &--active {
        background: #1976d21a;
        color: #1976d2; // Стандартний primary колір
        border-color: #1976d2;
      }
    }
  }
</style>
