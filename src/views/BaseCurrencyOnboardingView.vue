<script setup lang="ts">
import { computed, ref } from 'vue'
import MdiIcon from '../components/common/MdiIcon.vue'
import { useFavoriteCurrenciesStore } from '../stores/favoriteCurrencies'
import { COMMON_CURRENCIES, DEFAULT_CURRENCY_BY_LOCALE, currencyLabel } from '../utils/currencies'
import { getChosenBaseCurrency, setChosenBaseCurrency } from '../utils/baseCurrencyChoice'
import { locale, t } from '../i18n'

/**
 * Second screen of the very-first-launch flow — shown right after
 * LanguageOnboardingView confirms a language, and before anything else (see
 * App.vue's `needsBaseCurrencyChoice`, backed by `hasChosenBaseCurrency()`,
 * see utils/baseCurrencyChoice.ts). Its own "back" link returns to that
 * language screen; ServerSetupView.vue's own "back" link, one step later,
 * returns HERE — a strictly sequential chain (see App.vue's own comment by
 * `needsBaseCurrencyChoice`), so this choice always stays reachable again
 * until the whole onboarding flow is actually done, not just skippable past.
 *
 * v-else-if in App.vue means this unmounts while confirmed and remounts on
 * that "back", so `selected`'s initializer below re-runs fresh each time —
 * prioritizing whatever was already chosen (getChosenBaseCurrency()) so
 * reopening this screen to change something shows the PREVIOUS pick
 * highlighted, not a reset-to-guess default; only a genuinely first visit
 * (nothing chosen yet) falls back to a guess from the just-chosen language.
 *
 * Unlike the language screen, nothing on screen renders differently while
 * this is open — there's no live "current base currency" before a profile
 * exists — so the choice made here is only ever read back once, by
 * db/seed.ts and db/onboarding.ts (via getChosenBaseCurrency()), as the
 * INITIAL value for a brand-new profile's own `settings.baseCurrency`, never
 * overriding one that already exists. It stays changeable anytime after that
 * from Settings, exactly like language.
 *
 * Reuses the same search + favorites list as CurrencyPickerModal.vue rather
 * than a fixed set of rows (unlike the ~21-language list, ~160 currencies
 * don't fit as plain buttons).
 */
const emit = defineEmits<{ confirmed: []; backToLanguage: [] }>()

const favorites = useFavoriteCurrenciesStore()
const query = ref('')
const selected = ref(getChosenBaseCurrency() ?? DEFAULT_CURRENCY_BY_LOCALE[locale.value] ?? 'UAH')

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return COMMON_CURRENCIES
  return COMMON_CURRENCIES.filter((c) => c.code.toLowerCase().includes(q) || currencyLabel(c.code).toLowerCase().includes(q))
})

const favoriteList = computed(() => filtered.value.filter((c) => favorites.isFavorite(c.code)))
const otherList = computed(() => filtered.value.filter((c) => !favorites.isFavorite(c.code)))

function choose(code: string) {
  selected.value = code
}

function confirm() {
  setChosenBaseCurrency(selected.value)
  emit('confirmed')
}
</script>

<template>
  <div class="onboarding-shell">
    <div class="card">
      <button type="button" class="back-link" @click="emit('backToLanguage')">
        <MdiIcon name="mdiArrowLeft" :size="16" />
        {{ t('languageOnboarding.backButton') }}
      </button>

      <MdiIcon name="mdiCurrencyUsd" :size="44" color="var(--accent)" />
      <h1>{{ t('baseCurrencyOnboarding.title') }}</h1>
      <p class="hint">{{ t('baseCurrencyOnboarding.hint') }}</p>

      <input v-model="query" type="text" :placeholder="t('currencyPicker.search')" class="search" />

      <div class="list">
        <template v-if="favoriteList.length">
          <p class="group-label">{{ t('currencyPicker.favorites') }}</p>
          <button
            v-for="c in favoriteList"
            :key="c.code"
            type="button"
            class="currency-row"
            :class="{ selected: c.code === selected }"
            @click="choose(c.code)"
          >
            <span class="currency-label">{{ currencyLabel(c.code) }}</span>
            <MdiIcon v-if="c.code === selected" name="mdiCheck" :size="18" color="var(--accent)" />
          </button>
        </template>

        <p class="group-label">{{ favoriteList.length ? t('currencyPicker.allCurrencies') : t('currencyPicker.currencies') }}</p>
        <button
          v-for="c in otherList"
          :key="c.code"
          type="button"
          class="currency-row"
          :class="{ selected: c.code === selected }"
          @click="choose(c.code)"
        >
          <span class="currency-label">{{ currencyLabel(c.code) }}</span>
          <MdiIcon v-if="c.code === selected" name="mdiCheck" :size="18" color="var(--accent)" />
        </button>
        <p v-if="!filtered.length" class="hint">{{ t('currencyPicker.notFound') }}</p>
      </div>

      <button type="button" class="btn btn-primary confirm-btn" @click="confirm">
        {{ t('languageOnboarding.confirmButton') }}
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.onboarding-shell {
  @include viewportHeight('height');
  @include viewportHeight('min-height');
  @include overflow(y);
  display: flex;
  justify-content: center;
  padding: 24px;
}

.card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
  max-width: 380px;
  width: 100%;
  // Same auto-margin reasoning as LanguageOnboardingView.vue's own .card.
  margin: auto 0;
}

.back-link {
  display: flex;
  align-items: center;
  gap: 4px;
  align-self: flex-start;
  border: none;
  background: none;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  padding: 0;
  margin-bottom: 4px;
}

.card h1 {
  margin: 4px 0 0;
  font-size: 20px;
  line-height: 1.4;
}

.hint {
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
  margin: 0 0 4px;
}

.search {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 10px 14px;
  font-size: 14px;
  color: var(--text-primary);
  outline: none;
  width: 100%;
}

.list {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: min(40vh, 320px);
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 6px;
}

.group-label {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin: 8px 4px 4px;
  text-align: left;
}

.group-label:first-of-type {
  margin-top: 2px;
}

.currency-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  border: none;
  background: none;
  padding: 9px 8px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  text-align: left;
  font-size: 13.5px;
  color: var(--text-primary);

  @include hover() {
    background: var(--surface-2);
  }
}

.currency-row.selected {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}

.currency-label {
  flex: 1;
  min-width: 0;
}

.confirm-btn {
  width: 100%;
  margin-top: 4px;
}
</style>
