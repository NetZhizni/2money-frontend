<script setup lang="ts">
import { computed, ref } from 'vue'
import MdiIcon from '../components/common/MdiIcon.vue'
import TagFormModal from '../components/tags/TagFormModal.vue'
import { useTagsStore } from '../stores/tags'
import { useViewAsStore } from '../stores/viewAs'
import { usePopupsStore } from '../stores/popups'
import { t } from '../i18n'
import type { Tag } from '../types/models'

const tags = useTagsStore()
const viewAs = useViewAsStore()
const popups = usePopupsStore()

const readOnly = computed(() => viewAs.isReadOnly)

const showForm = ref(false)
const editingTag = ref<Tag | null>(null)

function openNew() {
  editingTag.value = null
  showForm.value = true
}
function openEdit(tag: Tag) {
  if (readOnly.value) return
  editingTag.value = tag
  showForm.value = true
}
function closeForm() {
  showForm.value = false
}
function handleSaved() {
  showForm.value = false
}
function handleDeleteRequest() {
  const tag = editingTag.value
  if (!tag) return
  showForm.value = false
  popups.confirmDialog({
    title: t('tags.deleteTitle'),
    message: t('tags.deleteMessage', { name: tag.name }),
    confirmLabel: t('common.delete'),
    danger: true,
    onConfirm: async () => {
      await tags.remove(tag.id)
      popups.closeConfirm()
    },
  })
}
</script>

<template>
  <div class="view">
    <div>
      <h1 class="page-title">{{ t('tags.title') }}</h1>
    </div>
    <div class="view-scroll">
      <div class="view-scroll-content">
        <p class="hint">{{ t('tags.hint') }}</p>

        <button v-if="!readOnly" class="btn btn-primary add-btn" @click="openNew">
          <MdiIcon name="mdiPlus" :size="18" />
          {{ t('tags.addTag') }}
        </button>

        <ul v-if="tags.all.length" class="tag-list">
          <li v-for="tg in tags.all" :key="tg.id" class="tag-row" @click="openEdit(tg)">
            <span class="dot" :style="{ background: tg.color }" />
            <span class="tag-name">{{ tg.name }}</span>
            <MdiIcon v-if="!readOnly" name="mdiChevronRight" :size="18" color="var(--text-muted)" />
          </li>
        </ul>
        <p v-else class="hint">{{ t('tags.empty') }}</p>
      </div>
    </div>
  </div>

  <TagFormModal :open="showForm" :tag="editingTag" @close="closeForm" @saved="handleSaved" @deleted="handleDeleteRequest" />
</template>

<style lang="scss" scoped>
.page-title {
  font-size: 20px;
  margin: 8px 0 4px;
}
.hint {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0 0 4px;
}
.add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  margin-bottom: 4px;
}
.tag-list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tag-row {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--surface);
  border-radius: var(--radius-md);
  padding: 12px 14px;
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  @include transition();
}
.tag-row:active {
  transform: scale(0.98);
}
.dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex-shrink: 0;
}
.tag-name {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  @include lineClamp(1);
}
</style>
