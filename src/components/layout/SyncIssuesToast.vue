<script setup lang="ts">
import { computed } from 'vue'
import MdiIcon from '../common/MdiIcon.vue'
import { useAuthStore } from '../../stores/auth'
import { useSyncIssuesStore } from '../../stores/syncIssues'
import { t } from '../../i18n'

// Announces a change the server didn't take the moment it happens (see
// stores/syncIssues.ts) — otherwise the only sign would be the header icon
// turning red, and the user's edit quietly reverting in front of them.
// "Close" just marks it seen; the list stays in the sync modal until dismissed.
const authStore = useAuthStore()
const syncIssues = useSyncIssuesStore()

const visible = computed(() => !authStore.localMode && syncIssues.unseen.length > 0 && !syncIssues.detailsOpen)
</script>

<template>
  <Transition name="toast">
    <div v-if="visible" class="toast" role="alert">
      <MdiIcon name="mdiCloudAlertOutline" :size="22" color="var(--expense)" />
      <span class="text">{{ t('sync.issues.toast') }}</span>
      <div class="actions">
        <button class="btn btn-ghost" @click="syncIssues.markSeen()">{{ t('common.close') }}</button>
        <button class="btn btn-primary" @click="syncIssues.openDetails()">{{ t('sync.issues.view') }}</button>
      </div>
    </div>
  </Transition>
</template>

<style lang="scss" scoped>
// Top of the screen, so it never stacks on top of UpdateToast at the bottom.
.toast {
  position: fixed;
  left: 50%;
  top: calc(env(safe-area-inset-top, 0px) + 12px);
  transform: translateX(-50%);
  z-index: 200;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--surface);
  color: var(--text-primary);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  width: min(460px, calc(100vw - 24px));
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
  transform: translateX(-50%) translateY(-12px);
}
</style>
