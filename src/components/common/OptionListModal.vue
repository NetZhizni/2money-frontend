<script setup lang="ts">
import Modal from './Modal.vue'
import MdiIcon from './MdiIcon.vue'

/**
 * Generic "pick one from a short list" popup — same row/active-state look as
 * CurrencyPickerModal, minus the search/favorites machinery that one needs
 * for ~160 entries. Built for Settings' number-format/date-format pickers,
 * but reusable for any future small enum choice: options carry their own
 * `sublabel` so a caller can show a live preview (e.g. "1 234,56") next to
 * the option's name instead of this component needing to know how to render one.
 */
export interface ListOption {
  value: string
  label: string
  sublabel?: string
}

const props = defineProps<{ open: boolean; title: string; options: ListOption[]; selected: string }>()
const emit = defineEmits<{ close: []; select: [string] }>()

function choose(value: string) {
  emit('select', value)
  emit('close')
}
</script>

<template>
  <Modal :open="open" :title="title" @close="emit('close')">
    <button
      v-for="opt in options"
      :key="opt.value"
      class="option"
      :class="{ active: opt.value === props.selected }"
      @click="choose(opt.value)"
    >
      <span class="option-text">
        <span class="option-label">{{ opt.label }}</span>
        <span v-if="opt.sublabel" class="option-sub">{{ opt.sublabel }}</span>
      </span>
      <MdiIcon v-if="opt.value === props.selected" name="mdiCheck" :size="18" color="var(--accent)" />
    </button>
  </Modal>
</template>

<style lang="scss" scoped>
.option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  border: none;
  background: none;
  padding: 10px 8px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  text-align: left;

  @include hover() {
    background: var(--surface-2);
  }
}

.option.active {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}

.option-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.option-label {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-primary);
}

.option-sub {
  font-size: 11.5px;
  color: var(--text-muted);
}
</style>
