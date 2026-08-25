<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '../stores/auth'
import MdiIcon from '../components/common/MdiIcon.vue'

const authStore = useAuthStore()
const signingIn = ref(false)
const error = ref('')

async function handleSignIn() {
  signingIn.value = true
  error.value = ''
  try {
    await authStore.signInWithGoogle()
  } catch (e) {
    error.value = 'Не вдалося увійти. Спробуйте ще раз.'
  } finally {
    signingIn.value = false
  }
}
</script>

<template>
  <div class="login-shell">
    <div class="card">
      <MdiIcon name="mdiWalletOutline" :size="48" color="var(--accent)" />
      <h1>2Money</h1>
      <p class="hint">Увійдіть через Google-акаунт родини.</p>

      <button class="btn btn-primary signin-btn" :disabled="signingIn" @click="handleSignIn">
        {{ signingIn ? 'Вхід…' : 'Увійти через Google' }}
      </button>

      <p v-if="authStore.deniedEmail" class="denied">
        Адреса <strong>{{ authStore.deniedEmail }}</strong>: {{ authStore.deniedMessage ?? 'доступ не надано.' }}
        Зверніться до адміністратора родини.
      </p>
      <p v-if="error" class="denied">{{ error }}</p>
    </div>
  </div>
</template>

<style scoped>
.login-shell {
  min-height: 100vh;
  min-height: 100dvh;
  overflow-y: auto;
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
</style>
