<script setup lang="ts">
import { ref } from 'vue'
import Modal from './Modal.vue'
import IconPicker from './IconPicker.vue'
import ColorPicker from './ColorPicker.vue'
import IconCircle from './IconCircle.vue'
import MdiIcon from './MdiIcon.vue'

const props = defineProps<{ icon: string; color: string }>()
const emit = defineEmits<{ close: []; 'update:icon': [string]; 'update:color': [string] }>()

const tab = ref<'icon' | 'color'>('icon')
</script>

<template>
  <Modal title="Значок і колір" @close="emit('close')">
    <div class="preview">
      <IconCircle :icon="props.icon" :color="props.color" :size="88" />
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
      :model-value="props.icon"
      :color="props.color"
      @update:model-value="(v) => emit('update:icon', v)"
    />
    <ColorPicker v-else :model-value="props.color" @update:model-value="(v) => emit('update:color', v)" />
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
</style>
