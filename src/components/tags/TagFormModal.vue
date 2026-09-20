<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import Modal from '../common/Modal.vue'
import ColorPicker from '../common/ColorPicker.vue'
import FieldRow from '../common/FieldRow.vue'
import { useTagsStore } from '../../stores/tags'
import { t } from '../../i18n'
import type { Tag } from '../../types/models'

const props = defineProps<{ open: boolean; tag?: Tag | null }>()
const emit = defineEmits<{ close: []; saved: [Tag]; deleted: [] }>()
const tags = useTagsStore()

const isEdit = computed(() => !!props.tag)

// Rebuilt fresh on every open (not just once at setup) — this component
// stays permanently mounted (see TagsView.vue), same pattern as
// CategoryFormModal.vue's own buildForm.
function buildForm() {
  return {
    name: props.tag?.name ?? '',
    color: props.tag?.color ?? '#2a78d6',
  }
}
const form = reactive(buildForm())

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    Object.assign(form, buildForm())
  },
)

const error = computed(() => (form.name.trim() ? '' : t('tags.form.nameRequired')))

async function submit() {
  if (error.value) return
  if (isEdit.value && props.tag) {
    await tags.update(props.tag.id, { name: form.name.trim(), color: form.color })
    emit('saved', { ...props.tag, name: form.name.trim(), color: form.color })
  } else {
    const created = await tags.add({ name: form.name.trim(), color: form.color })
    emit('saved', created)
  }
}
</script>

<template>
  <Modal :open="open" :title="isEdit ? t('tags.form.editTitle') : t('tags.form.newTitle')" @close="emit('close')">
    <FieldRow icon="mdiTagOutline" :label="t('tags.form.nameLabel')">
      <input v-model="form.name" type="text" class="field-row-value" :placeholder="t('tags.form.namePlaceholder')" />
    </FieldRow>
    <span v-if="error" class="field-error">{{ error }}</span>

    <div class="color-section">
      <label class="section-label">{{ t('common.color') }}</label>
      <ColorPicker v-model="form.color" />
    </div>

    <button class="btn btn-primary submit" :disabled="!!error" @click="submit">
      {{ isEdit ? t('common.save') : t('tags.form.create') }}
    </button>

    <div v-if="isEdit" class="danger-zone">
      <button class="btn btn-danger" @click="emit('deleted')">{{ t('tags.form.deleteTag') }}</button>
    </div>
  </Modal>
</template>

<style scoped>
.field-error {
  display: block;
  margin: -2px 2px 10px;
}
.color-section {
  margin: 4px 0 20px;
}
.section-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 8px;
}
.submit {
  width: 100%;
}
.danger-zone {
  margin-top: 12px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}
.danger-zone .btn {
  width: 100%;
}
</style>
