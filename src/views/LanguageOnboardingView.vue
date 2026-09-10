<script setup lang="ts">
import { ref } from 'vue'
import MdiIcon from '../components/common/MdiIcon.vue'
import { setLocaleSetting, locale, LOCALES, LOCALE_NAMES, localeFlagUrl, tFor } from '../i18n'
import type { Locale } from '../i18n'

/**
 * The very first thing shown on a brand-new device — before ServerSetupView,
 * before sign-in, before anything else — so every screen that follows
 * already renders in the right language. Gated in App.vue by
 * `needsLanguageChoice` (backed by `hasChosenLocale()`, see i18n/locale.ts):
 * shown once on a fresh device, and again any time ServerSetupView.vue's
 * "back to language" link sets that ref back to true.
 *
 * Tapping a row only *previews* that language — every string on this screen
 * (including this row's own label) re-renders live via `tFor(previewLocale,
 * key)` instead of the fixed `t()` most of the app uses, so someone who
 * can't read the currently-active language can still tell what they just
 * picked. Nothing is persisted until "Продовжити"/confirm is pressed, which
 * calls `setLocaleSetting` — same as changing it later in Settings — and
 * emits `confirmed` so App.vue closes this screen (setLocaleSetting itself
 * no longer reloads the page — see its own doc comment).
 */
const emit = defineEmits<{ confirmed: [] }>()

// Currently active locale first (what a "back" visit already has chosen —
// on a genuinely first visit this already equals the detected browser
// language, since `locale` itself falls back to `detectLocale()` before any
// choice is ever made). A STABLE order computed once, so rows never
// reshuffle as the user taps around; only the checkmark/highlight moves.
const priorityLocale = locale.value
const orderedLocales: Locale[] = [priorityLocale, ...LOCALES.filter((loc) => loc !== priorityLocale)]

const previewLocale = ref<Locale>(priorityLocale)

function tp(key: Parameters<typeof tFor>[1]): string {
  return tFor(previewLocale.value, key)
}

function choose(loc: Locale) {
  previewLocale.value = loc
}

function confirm() {
  setLocaleSetting(previewLocale.value)
  emit('confirmed')
}
</script>

<template>
  <div class="onboarding-shell">
    <div class="card">
      <MdiIcon name="mdiWeb" :size="44" color="var(--accent)" />
      <h1>{{ tp('languageOnboarding.title') }}</h1>
      <p class="hint">{{ tp('languageOnboarding.hint') }}</p>

      <div class="list">
        <button
          v-for="loc in orderedLocales"
          :key="loc"
          type="button"
          class="lang-row"
          :class="{ selected: loc === previewLocale }"
          @click="choose(loc)"
        >
          <img :src="localeFlagUrl(loc)" class="flag" :alt="LOCALE_NAMES[loc]" width="30" height="30" loading="lazy" />
          <span class="lang-name">{{ LOCALE_NAMES[loc] }}</span>
          <MdiIcon v-if="loc === previewLocale" name="mdiCheck" :size="18" color="var(--accent)" />
        </button>
      </div>

      <button type="button" class="btn btn-primary confirm-btn" @click="confirm">
        {{ tp('languageOnboarding.confirmButton') }}
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
  // See OnboardingView.vue's own .card for why auto margins (not `align-items:
  // safe center`) are what keeps this centered without clipping on overflow.
  margin: auto 0;
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

.list {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: min(48vh, 380px);
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 6px;
}

.lang-row {
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

  @include hover() {
    background: var(--surface-2);
  }
}

.lang-row.selected {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}

.flag {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 0 1px var(--border);
}

.lang-name {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.confirm-btn {
  width: 100%;
  margin-top: 4px;
}
</style>
