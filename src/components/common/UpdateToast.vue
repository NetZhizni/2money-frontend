<script setup lang="ts">
import { ref } from 'vue'
import { updateAvailable, applyUpdate } from '../../pwa/updateService'
import { t } from '../../i18n'

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
      <span class="text">{{ t('common.updateAvailable') }}</span>
      <div class="actions">
        <button class="btn btn-ghost" :disabled="applying" @click="dismissed = true">{{ t('common.later') }}</button>
        <button class="btn btn-primary" :disabled="applying" @click="onUpdateClick">
          {{ applying ? t('common.updating') : t('common.update') }}
        </button>
      </div>
    </div>
  </Transition>
</template>

<style lang="scss" scoped>
.toast {
  position: fixed;
  left: 50%;
  bottom: 24px;
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

@include laptop() {
  .toast {
    bottom: 84px;
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
  @include transition();
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(12px);
}
</style>
