<script setup lang="ts">
import { ref } from 'vue'
import { useServerStore } from '../stores/server'
import MdiIcon from '../components/common/MdiIcon.vue'
import { t, type MessageKey } from '../i18n'

const emit = defineEmits<{ back: [] }>()

const server = useServerStore()
const url = ref('')

async function handleConnect() {
  if (!url.value.trim() || server.connecting) return
  try {
    await server.connect(url.value)
    // connect() reloads the page on success — nothing left to do here.
  } catch {
    // server.connectError already holds a message key for the template.
  }
}
</script>

<template>
  <div class="setup-shell">
    <div class="card">
      <button type="button" class="back-link" @click="emit('back')">
        <MdiIcon name="mdiArrowLeft" :size="16" />
        {{ t('baseCurrencyOnboarding.backButton') }}
      </button>

      <MdiIcon name="mdiWalletOutline" :size="48" color="var(--accent)" />
      <h1>{{ t('server.setup.title') }}</h1>
      <p class="hint">{{ t('server.setup.hint') }}</p>

      <form class="url-form" @submit.prevent="handleConnect">
        <label class="field-label" for="server-url">{{ t('server.setup.urlLabel') }}</label>
        <input
          id="server-url"
          v-model="url"
          type="text"
          inputmode="url"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
          :placeholder="t('server.setup.urlPlaceholder')"
          :disabled="server.connecting"
          class="url-input"
        />
        <button type="submit" class="btn btn-primary connect-btn" :disabled="server.connecting || !url.trim()">
          {{ server.connecting ? t('server.setup.connecting') : t('server.setup.connectButton') }}
        </button>
        <p v-if="server.connectError" class="error">{{ t(server.connectError as MessageKey) }}</p>
      </form>

      <div class="divider"><span>{{ t('server.setup.orDivider') }}</span></div>

      <button type="button" class="btn btn-secondary local-btn" :disabled="server.connecting" @click="server.goLocalFirstTime()">
        {{ t('server.setup.localButton') }}
      </button>
      <p class="hint local-hint">{{ t('server.setup.localHint') }}</p>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.setup-shell {
  @include viewportHeight('height');
  @include viewportHeight('min-height');
  @include overflow(y);
  display: flex;
  align-items: center;
  // `safe` keeps this the same centered layout while there's room, but falls
  // back to top-aligned once the card is taller than the viewport — plain
  // `center` would otherwise crop the card evenly off both edges and leave
  // no way to scroll up to the part cut off above.
  align-items: safe center;
  justify-content: center;
  padding: 24px;
}

.card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
  max-width: 360px;
  width: 100%;
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
  font-size: 22px;
}

.hint {
  color: var(--text-secondary);
  font-size: 14px;
  margin: 0 0 8px;
}

.url-form {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 6px;
}

.field-label {
  text-align: left;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.url-input {
  width: 100%;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-primary);
  font-size: 14px;
}

.url-input:disabled {
  opacity: 0.6;
}

.connect-btn {
  width: 100%;
  margin-top: 4px;
}

.error {
  color: var(--expense);
  font-size: 13px;
  margin: 4px 0 0;
}

.divider {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-muted);
  font-size: 12px;
  margin: 14px 0;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border);
}

.local-btn {
  width: 100%;
}

.local-hint {
  font-size: 12px;
  margin-top: 6px;
}
</style>
