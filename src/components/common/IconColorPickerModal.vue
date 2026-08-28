<script setup lang="ts">
import { computed, ref } from 'vue'
import Modal from './Modal.vue'
import IconPicker from './IconPicker.vue'
import ColorPicker from './ColorPicker.vue'
import IconCircle from './IconCircle.vue'
import MdiIcon from './MdiIcon.vue'

const props = defineProps<{ icon: string; color: string }>()
const emit = defineEmits<{ close: []; 'update:icon': [string]; 'update:color': [string] }>()

const tab = ref<'icon' | 'color'>('icon')

// Staged locally while browsing — nothing is applied to the "Рахунок" /
// "Витрати" / "Доходи" edit popup underneath until "Обрати" is pressed.
const localIcon = ref(props.icon)
const localColor = ref(props.color)
const changed = computed(() => localIcon.value !== props.icon || localColor.value !== props.color)

function confirm() {
  emit('update:icon', localIcon.value)
  emit('update:color', localColor.value)
  emit('close')
}
</script>

<template>
  <Modal title="Значок і колір" @close="emit('close')">
    <div class="preview">
      <IconCircle :icon="localIcon" :color="localColor" :size="88" />
    </div>

    <div class="tab-switch">
      <button class="tab-btn" :class="{ active: tab === 'icon' }" @click="tab = 'icon'">
        <MdiIcon name="mdiStarOutline" :size="18" />
        <span>Значок</span>
      </button>
      <button class="tab-btn" :class="{ active: tab === 'color' }" @click="tab = 'color'">
        <MdiIcon name="mdiPaletteOutline" :size="18" />
        <span>Колір</span>
      </button>
    </div>

    <IconPicker
      v-if="tab === 'icon'"
      :model-value="localIcon"
      :color="localColor"
      @update:model-value="(v) => (localIcon = v)"
    />
    <ColorPicker v-else :model-value="localColor" @update:model-value="(v) => (localColor = v)" />

    <button type="button" class="btn btn-primary confirm-btn" :disabled="!changed" @click="confirm">Обрати</button>
  </Modal>
</template>

<style scoped>
.preview {
  display: flex;
  justify-content: center;
  margin-bottom: 16px;
}

.tab-switch {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-bottom: 20px;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  padding: 10px 18px;
  border-radius: var(--radius-pill);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.tab-btn.active {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
}

.confirm-btn {
  width: 100%;
  margin-top: 16px;
}
</style>
