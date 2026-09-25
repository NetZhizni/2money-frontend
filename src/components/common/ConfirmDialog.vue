<script setup lang="ts">
import Modal from './Modal.vue'
import { t } from '../../i18n'

// `secondaryLabel` adds a second action next to the confirm one (see
// stores/popups.ts's choiceDialog); `hideConfirm` leaves only Cancel, for a
// dialog that just explains why nothing can be done.
const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    message: string
    confirmLabel?: string
    danger?: boolean
    secondaryLabel?: string
    hideConfirm?: boolean
  }>(),
  { danger: false, hideConfirm: false },
)
const emit = defineEmits<{ confirm: []; secondary: []; close: [] }>()
</script>

<template>
  <Modal :open="open" :title="title" top @close="emit('close')">
    <p class="message">{{ message }}</p>
    <div :class="['actions', { stacked: secondaryLabel }]">
      <button class="btn btn-ghost" @click="emit('close')">{{ t('common.cancel') }}</button>
      <button v-if="secondaryLabel" class="btn btn-secondary" @click="emit('secondary')">{{ secondaryLabel }}</button>
      <button v-if="!hideConfirm" :class="['btn', danger ? 'btn-danger' : 'btn-primary']" @click="emit('confirm')">
        {{ props.confirmLabel ?? t('common.confirm') }}
      </button>
    </div>
  </Modal>
</template>

<style scoped>
.message {
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.5;
  margin: 0 0 20px;
}
.actions {
  display: flex;
  gap: 10px;
}
.actions .btn {
  flex: 1;
}
/* Three buttons don't fit side by side on a phone — stack them, the main
   action on top and Cancel at the bottom (the reverse of the DOM order). */
.actions.stacked {
  flex-direction: column-reverse;
}
</style>
