<script setup lang="ts">
import { ref } from 'vue'
import { updateAvailable, applyUpdate } from '../../pwa/updateService'

// "Пізніше" just hides the toast for this tab — updateAvailable itself stays
// true, and setupServiceWorker's interval keeps the SW waiting, so the app
// still updates on the next full reload even if the user never comes back.
const dismissed = ref(false)

const applying = ref(false)
async function onUpdateClick() {
  applying.value = true
  await applyUpdate()
}
</script>

<template>
  <Transition name="toast">
    <div v-if="updateAvailable && !dismissed" class="toast" role="status">
      <span class="text">Доступна нова версія застосунку</span>
      <div class="actions">
        <button class="btn btn-ghost" :disabled="applying" @click="dismissed = true">Пізніше</button>
        <button class="btn btn-primary" :disabled="applying" @click="onUpdateClick">
          {{ applying ? 'Оновлення…' : 'Оновити' }}
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.toast {
  position: fixed;
  left: 50%;
  bottom: 84px;
  transform: translateX(-50%);
  z-index: 200;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px 12px 18px;
  background: var(--surface);
  color: var(--text-primary);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  width: min(420px, calc(100vw - 24px));
}

@media (min-width: 900px) {
  .toast {
    bottom: 24px;
  }
}

.text {
  flex: 1;
  font-size: 14px;
}

.actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.actions .btn {
  padding: 8px 14px;
  white-space: nowrap;
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(12px);
}
</style>
