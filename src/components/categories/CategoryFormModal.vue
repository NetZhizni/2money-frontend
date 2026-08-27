<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import Modal from '../common/Modal.vue'
import IconCircle from '../common/IconCircle.vue'
import IconColorPickerModal from '../common/IconColorPickerModal.vue'
import MdiIcon from '../common/MdiIcon.vue'
import { useCategoriesStore } from '../../stores/categories'
import type { Category, CategoryKind } from '../../types/models'

const props = defineProps<{
  category?: Category | null
  defaultKind?: CategoryKind
  defaultParentId?: string | null
}>()

const emit = defineEmits<{ close: []; saved: [Category]; deleted: []; archived: [] }>()
const categories = useCategoriesStore()

const isEdit = computed(() => !!props.category)

const form = reactive({
  name: props.category?.name ?? '',
  kind: props.category?.kind ?? props.defaultKind ?? 'expense',
  parentId: props.category?.parentId ?? props.defaultParentId ?? null,
  icon: props.category?.icon ?? 'mdiShapeOutline',
  color: props.category?.color ?? '#2a78d6',
})

const showIconColorPicker = ref(false)

const isSubcategory = computed(() => !!form.parentId)

const parentOptions = computed(() =>
  categories.topLevel(form.kind, true).filter((c) => c.id !== props.category?.id),
)

const error = computed(() => (form.name.trim() ? '' : "Вкажіть назву категорії"))

async function submit() {
  if (error.value) return
  if (isEdit.value && props.category) {
    await categories.update(props.category.id, {
      name: form.name.trim(),
      icon: form.icon,
      color: form.color,
      parentId: form.parentId,
    })
    emit('saved', { ...props.category, name: form.name.trim(), icon: form.icon, color: form.color, parentId: form.parentId })
  } else {
    const created = await categories.add({
      name: form.name.trim(),
      kind: form.kind,
      icon: form.icon,
      color: form.color,
      parentId: form.parentId,
      archived: false,
    })
    emit('saved', created)
  }
}

function toggleParent(id: string | null) {
  form.parentId = id
  if (id) {
    const parent = categories.byId(id)
    if (parent) form.kind = parent.kind
  }
}
</script>

<template>
  <Modal :title="isEdit ? 'Редагувати категорію' : 'Нова категорія'" @close="emit('close')">
    <button type="button" class="preview" aria-label="Змінити значок і колір" @click="showIconColorPicker = true">
      <span class="preview-inner">
        <IconCircle :icon="form.icon" :color="form.color" :size="72" />
        <span class="preview-edit-badge">
          <MdiIcon name="mdiPencilOutline" :size="14" color="var(--surface)" />
        </span>
      </span>
    </button>

    <div class="field" v-if="!isEdit">
      <label>Тип</label>
      <div class="segmented">
        <button :class="{ active: form.kind === 'expense' }" @click="form.kind = 'expense'">Витрата</button>
        <button :class="{ active: form.kind === 'income' }" @click="form.kind = 'income'">Дохід</button>
      </div>
    </div>

    <div class="field">
      <label>Назва</label>
      <input v-model="form.name" type="text" placeholder="Напр. Кафе" />
      <span v-if="error" class="field-error">{{ error }}</span>
    </div>

    <div class="field">
      <label>Батьківська категорія (підкатегорія)</label>
      <select :value="form.parentId ?? ''" @change="toggleParent(($event.target as HTMLSelectElement).value || null)">
        <option value="">— Окрема категорія —</option>
        <option v-for="p in parentOptions" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
      <span v-if="isSubcategory" class="hint">Успадковує тип батьківської категорії.</span>
    </div>

    <button class="btn btn-primary submit" :disabled="!!error" @click="submit">
      {{ isEdit ? 'Зберегти' : 'Створити' }}
    </button>

    <div v-if="isEdit" class="danger-zone">
      <button class="btn btn-secondary" @click="emit('archived')">
        {{ props.category?.archived ? 'Розархівувати' : 'Архівувати' }}
      </button>
      <button class="btn btn-danger" @click="emit('deleted')">Видалити категорію</button>
    </div>
  </Modal>

  <IconColorPickerModal
    v-if="showIconColorPicker"
    :icon="form.icon"
    :color="form.color"
    @update:icon="(v) => (form.icon = v)"
    @update:color="(v) => (form.color = v)"
    @close="showIconColorPicker = false"
  />
</template>

<style scoped>
.preview {
  display: flex;
  justify-content: center;
  margin-bottom: 16px;
  width: 100%;
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
}
.preview-inner {
  position: relative;
  display: inline-flex;
}
.preview-edit-badge {
  position: absolute;
  right: -2px;
  bottom: -2px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--accent);
  border: 2px solid var(--surface);
  display: flex;
  align-items: center;
  justify-content: center;
}
.hint {
  font-size: 12px;
  color: var(--text-muted);
}
.submit {
  width: 100%;
  margin-top: 4px;
}
.danger-zone {
  display: flex;
  gap: 10px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}
.danger-zone .btn {
  flex: 1;
}
</style>
