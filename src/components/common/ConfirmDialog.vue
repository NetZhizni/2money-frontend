<script setup lang="ts">
import Modal from './Modal.vue'
import { t } from '../../i18n'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    message: string
    confirmLabel?: string
    danger?: boolean
  }>(),
  { danger: false },
)
const emit = defineEmits<{ confirm: []; close: [] }>()
</script>

<template>
  <Modal :open="open" :title="title" top @close="emit('close')">
    <p class="message">{{ message }}</p>
    <div class="actions">
      <button class="btn btn-ghost" @click="emit('close')">{{ t('common.cancel') }}</button>
      <button :class="['btn', danger ? 'btn-danger' : 'btn-primary']" @click="emit('confirm')">
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
</style>
