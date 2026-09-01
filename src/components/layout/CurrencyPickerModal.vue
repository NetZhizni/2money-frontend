<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Modal from '../common/Modal.vue'
import MdiIcon from '../common/MdiIcon.vue'
import { useDisplayCurrencyStore } from '../../stores/displayCurrency'
import { useSettingsStore } from '../../stores/settings'
import { useFavoriteCurrenciesStore } from '../../stores/favoriteCurrencies'
import { COMMON_CURRENCIES } from '../../utils/currencies'

const display = useDisplayCurrencyStore()
const settings = useSettingsStore()
const favorites = useFavoriteCurrenciesStore()
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const query = ref('')

// Stays permanently mounted — always starts from an empty search on reopen.
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) query.value = ''
  },
)

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return COMMON_CURRENCIES
  return COMMON_CURRENCIES.filter((c) => c.code.toLowerCase().includes(q) || c.label.toLowerCase().includes(q))
})

// Favorites keep the picker usable now that the list runs to 40 currencies —
// starred ones surface at the top instead of the user hunting alphabetically.
const favoriteList = computed(() => filtered.value.filter((c) => favorites.isFavorite(c.code)))
const otherList = computed(() => filtered.value.filter((c) => !favorites.isFavorite(c.code)))

function choose(code: string) {
  display.set(code === settings.baseCurrency ? null : code)
  emit('close')
}
</script>

<template>
  <Modal :open="open" title="Показувати суми в…" @close="emit('close')">
    <input v-model="query" type="text" placeholder="Пошук валюти…" class="search" />

    <template v-if="favoriteList.length">
      <p class="group-label">Обрані</p>
      <div
        v-for="c in favoriteList"
        :key="c.code"
        class="option"
        :class="{ active: c.code === display.effective }"
        role="button"
        tabindex="0"
        @click="choose(c.code)"
        @keydown.enter="choose(c.code)"
      >
        <button class="star" aria-label="Прибрати з обраних" @click.stop="favorites.toggle(c.code)">
          <MdiIcon name="mdiStar" :size="18" color="var(--accent)" />
        </button>
        <span class="option-label">{{ c.label }}</span>
        <span v-if="c.code === settings.baseCurrency" class="badge">базова</span>
      </div>
    </template>

    <p class="group-label">{{ favoriteList.length ? 'Усі валюти' : 'Валюти' }}</p>
    <div
      v-for="c in otherList"
      :key="c.code"
      class="option"
      :class="{ active: c.code === display.effective }"
      role="button"
      tabindex="0"
      @click="choose(c.code)"
      @keydown.enter="choose(c.code)"
    >
      <button class="star" aria-label="Додати в обрані" @click.stop="favorites.toggle(c.code)">
        <MdiIcon name="mdiStarOutline" :size="18" color="var(--text-muted)" />
      </button>
      <span class="option-label">{{ c.label }}</span>
      <span v-if="c.code === settings.baseCurrency" class="badge">базова</span>
    </div>
    <p v-if="!filtered.length" class="hint">Нічого не знайдено.</p>

    <p class="hint footer-hint">
      Впливає лише на відображення — не змінює базову валюту в Налаштуваннях. Зірочкою позначайте
      валюти, які мають бути першими у списку.
    </p>
  </Modal>
</template>

<style scoped>
.search {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 10px 14px;
  font-size: 14px;
  color: var(--text-primary);
  outline: none;
  width: 100%;
  margin-bottom: 8px;
}

.group-label {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin: 12px 4px 4px;
}

.group-label:first-of-type {
  margin-top: 4px;
}

.option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  border: none;
  background: none;
  padding: 9px 8px;
  border-radius: var(--radius-sm);
  font-size: 13.5px;
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
}

.option:hover {
  background: var(--surface-2);
}

.option.active {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
  font-weight: 600;
}

.option-label {
  flex: 1;
  min-width: 0;
}

.star {
  border: none;
  background: none;
  padding: 4px;
  margin: -4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}

.badge {
  font-size: 10px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.hint {
  font-size: 10.5px;
  color: var(--text-muted);
  padding: 8px 8px 2px;
  margin: 0;
}

.footer-hint {
  border-top: 1px solid var(--border);
  padding-top: 10px;
  margin-top: 8px;
}
</style>
