<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Modal from '../common/Modal.vue'
import MdiIcon from '../common/MdiIcon.vue'
import { useTagsStore } from '../../stores/tags'
import { t } from '../../i18n'

const props = defineProps<{ open: boolean; selectedIds: string[] }>()
const emit = defineEmits<{ close: []; 'update:selectedIds': [string[]] }>()
const tags = useTagsStore()

// A small rotation so tags quick-added from here don't all land on the same
// color — the full ColorPicker (Settings → Tags → edit) is where someone
// actually picks one on purpose.
const QUICK_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#4a3aa7', '#00838f', '#c2185b']

// Archived tags aren't offered for new use — except ones this operation
// already carried when the picker opened, which stay listed (even once
// unticked) so they can still be taken off, or put back before closing.
const openedWithIds = ref<string[]>([])
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) openedWithIds.value = [...props.selectedIds]
  },
  { immediate: true },
)
const visibleTags = computed(() => tags.all.filter((tg) => !tg.archived || openedWithIds.value.includes(tg.id)))

function isSelected(id: string): boolean {
  return props.selectedIds.includes(id)
}

function toggle(id: string) {
  const next = isSelected(id) ? props.selectedIds.filter((x) => x !== id) : [...props.selectedIds, id]
  emit('update:selectedIds', next)
}

const newTagName = ref('')
const creating = ref(false)

async function createTag() {
  const name = newTagName.value.trim()
  if (!name || creating.value) return
  creating.value = true
  try {
    const created = await tags.add({ name, color: QUICK_COLORS[tags.all.length % QUICK_COLORS.length] })
    newTagName.value = ''
    toggle(created.id)
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <Modal :open="open" :title="t('tags.picker.title')" top @close="emit('close')">
    <p v-if="!visibleTags.length" class="empty">{{ t('tags.picker.empty') }}</p>
    <div v-else class="chip-grid">
      <button
        v-for="tg in visibleTags"
        :key="tg.id"
        type="button"
        class="chip"
        :class="{ selected: isSelected(tg.id) }"
        :style="isSelected(tg.id) ? { background: tg.color, borderColor: tg.color } : undefined"
        @click="toggle(tg.id)"
      >
        <MdiIcon v-if="isSelected(tg.id)" name="mdiCheck" :size="14" color="#fff" />
        <span v-else class="chip-dot" :style="{ background: tg.color }" />
        <span>{{ tg.name }}</span>
      </button>
    </div>

    <div class="new-tag-row">
      <input
        v-model="newTagName"
        type="text"
        class="field-row-value new-tag-input"
        :placeholder="t('tags.picker.newTagPlaceholder')"
        @keyup.enter="createTag"
      />
      <button class="btn btn-secondary" :disabled="!newTagName.trim() || creating" @click="createTag">
        {{ t('common.add') }}
      </button>
    </div>
  </Modal>
</template>

<style lang="scss" scoped>
.empty {
  font-size: 13px;
  color: var(--text-muted);
  padding: 4px 0 12px;
  text-align: center;
}

.chip-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.chip {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text-secondary);
  border-radius: var(--radius-pill);
  padding: 8px 14px;
  font-size: 13px;
  cursor: pointer;
  @include transition();
}

.chip.selected {
  color: #fff;
  border-color: transparent;
}

.chip-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
}

.new-tag-row {
  display: flex;
  gap: 8px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
}

.new-tag-input {
  flex: 1;
  min-width: 0;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
}
</style>
