<script setup lang="ts">
import { useDisplayCurrencyStore } from '../../stores/displayCurrency'
import { useSettingsStore } from '../../stores/settings'
import { COMMON_CURRENCIES } from '../../utils/currencies'

const display = useDisplayCurrencyStore()
const settings = useSettingsStore()
const emit = defineEmits<{ close: [] }>()

function choose(code: string) {
  display.set(code === settings.baseCurrency ? null : code)
  emit('close')
}
</script>

<template>
  <div class="popover" @mousedown.stop>
    <p class="title">Показувати суми в…</p>
    <button
      v-for="c in COMMON_CURRENCIES"
      :key="c.code"
      class="option"
      :class="{ active: c.code === display.effective }"
      @click="choose(c.code)"
    >
      <span>{{ c.label }}</span>
      <span v-if="c.code === settings.baseCurrency" class="badge">базова</span>
    </button>
    <p class="hint">Впливає лише на відображення — не змінює базову валюту в Налаштуваннях.</p>
  </div>
</template>

<style scoped>
.popover {
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--surface);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  padding: 10px;
  z-index: 50;
  width: 220px;
  max-height: 320px;
  overflow-y: auto;
}

.title {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin: 2px 8px 8px;
}

.option {
  display: flex;
  align-items: center;
  justify-content: space-between;
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

.badge {
  font-size: 10px;
  color: var(--text-muted);
}

.hint {
  font-size: 10.5px;
  color: var(--text-muted);
  padding: 8px 8px 2px;
  margin: 0;
  border-top: 1px solid var(--border);
}
</style>
