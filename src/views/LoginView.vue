<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useServerStore } from '../stores/server'
import { useChangeServer } from '../composables/useChangeServer'
import MdiIcon from '../components/common/MdiIcon.vue'
import { t } from '../i18n'

const authStore = useAuthStore()
const server = useServerStore()
const signingIn = ref(false)
const error = ref('')

async function handleSignIn() {
  signingIn.value = true
  error.value = ''
  try {
    await authStore.signInWithGoogle()
  } catch (e) {
    error.value = t('login.signInFailed')
  } finally {
    signingIn.value = false
  }
}

// This screen only ever shows while `server.mode === 'remote'` (see
// App.vue) — i.e. a server IS configured, there's just no signed-in
// profile for it right now (fresh sign-out, denied access, or a device
// that lost its cached profile while offline). Without this, someone who
// pressed "Sign out" — or landed here denied/offline — would have no way
// back to ServerSetupView to point the app at a different server: it only
// renders once for a brand-new device (`server.mode === 'unconfigured'`),
// never again afterwards. See composables/useChangeServer.ts for the
// shared confirm-and-wipe logic (same one SettingsModal's "Server" section
// uses while signed in).
//
// Destructured into individually-named bindings (not kept as one grouped
// object) so Vue's template compiler auto-unwraps each ref — it only does
// that for top-level `<script setup>` bindings, not for a ref nested a
// property deep inside some other object.
const {
  showField: showServerChangeField,
  newUrl: newServerUrl,
  switching: switchingServer,
  error: serverSwitchError,
  open: openServerChange,
  cancel: cancelServerChange,
  confirmChange: confirmChangeServer,
  confirmGoLocal,
} = useChangeServer()
</script>

<template>
  <div class="login-shell">
    <div class="card">
      <MdiIcon name="mdiWalletOutline" :size="48" color="var(--accent)" />
      <h1>2Money</h1>
      <p class="hint">{{ t('login.signInHint') }}</p>

      <button class="btn btn-primary signin-btn" :disabled="signingIn" @click="handleSignIn">
        {{ signingIn ? t('login.signingIn') : t('login.signInButton') }}
      </button>

      <p v-if="authStore.deniedEmail" class="denied">
        <strong>{{ authStore.deniedEmail }}</strong>: {{ authStore.deniedMessage ?? t('login.accessNotGranted') }}
        {{ t('login.deniedSuffix') }}
      </p>
      <p v-if="error" class="denied">{{ error }}</p>

      <div class="server-section">
        <p class="current-server">{{ t('server.settings.currentRemote') }}: {{ server.serverUrl }}</p>

        <div v-if="!showServerChangeField" class="server-links">
          <button type="button" class="link-btn" @click="openServerChange">
            {{ t('server.settings.changeButton') }}
          </button>
          <button type="button" class="link-btn" :disabled="switchingServer" @click="confirmGoLocal">
            {{ t('server.settings.goLocalButton') }}
          </button>
        </div>

        <template v-else>
          <label class="field-label" for="login-server-url">{{ t('server.settings.changeLabel') }}</label>
          <input
            id="login-server-url"
            v-model="newServerUrl"
            type="text"
            inputmode="url"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
            :placeholder="t('server.setup.urlPlaceholder')"
            :disabled="switchingServer"
            class="url-input"
          />
          <div class="server-actions">
            <button type="button" class="btn btn-primary" :disabled="switchingServer || !newServerUrl.trim()" @click="confirmChangeServer">
              {{ switchingServer ? t('server.switching') : t('server.settings.changeButton') }}
            </button>
            <button type="button" class="btn btn-secondary" :disabled="switchingServer" @click="cancelServerChange">
              {{ t('common.cancel') }}
            </button>
          </div>
          <p v-if="serverSwitchError" class="error">{{ serverSwitchError }}</p>
        </template>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.login-shell {
  min-height: 100vh;
  min-height: 100dvh;
  @include overflow(y);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
  max-width: 340px;
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

.signin-btn {
  width: 100%;
}

.denied {
  color: var(--expense);
  font-size: 13px;
  margin-top: 12px;
}

.server-section {
  width: 100%;
  margin-top: 20px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.current-server {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0;
  word-break: break-all;
}

.server-links {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.link-btn {
  border: none;
  background: none;
  color: var(--accent);
  font-size: 13px;
  cursor: pointer;
  padding: 2px;
}

.link-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.field-label {
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-top: 4px;
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

.server-actions {
  display: flex;
  gap: 8px;
  margin-top: 2px;
}

.server-actions .btn {
  flex: 1;
}

.error {
  color: var(--expense);
  font-size: 12.5px;
  margin: 2px 0 0;
}
</style>
