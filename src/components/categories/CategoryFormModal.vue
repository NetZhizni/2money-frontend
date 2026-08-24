<script setup lang="ts">
import { computed, reactive } from 'vue'
import Modal from '../common/Modal.vue'
import IconPicker from '../common/IconPicker.vue'
import ColorPicker from '../common/ColorPicker.vue'
import IconCircle from '../common/IconCircle.vue'
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
    <div class="preview">
      <IconCircle :icon="form.icon" :color="form.color" :size="72" />
    </div>

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

    <div class="field">
      <label>Іконка</label>
      <IconPicker v-model="form.icon" :color="form.color" />
    </div>

    <div class="field">
      <label>Колір</label>
      <ColorPicker v-model="form.color" />
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
</template>

<style scoped>
.preview {
  display: flex;
  justify-content: center;
  margin-bottom: 16px;
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
