<script setup lang="ts">
import Modal from '../common/Modal.vue'
import MdiIcon from '../common/MdiIcon.vue'
import { LOCALES, LOCALE_NAMES, localeFlagUrl, t } from '../../i18n'
import type { LocaleSetting } from '../../i18n'

/**
 * "Мова" popup — replaces the old 3-way (Системна/Українська/English)
 * Segmented control now that the app supports LOCALES.length languages
 * (see i18n/locale.ts): a Segmented control stops being usable well before
 * 20 options, same reason Settings already uses a dedicated popup for
 * currency/number-format/date-format instead. Each row shows its own
 * Circle Flags icon (see public/flags) next to the language's OWN native
 * name (not translated into whichever language is currently active — that
 * would defeat the point for someone trying to find their own language in a
 * UI they can't read yet).
 */
const props = defineProps<{ open: boolean; selected: LocaleSetting }>()
const emit = defineEmits<{ close: []; select: [LocaleSetting] }>()

function choose(value: LocaleSetting) {
  emit('select', value)
  emit('close')
}
</script>

<template>
  <Modal :open="open" :title="t('layout.settings.language')" @close="emit('close')">
    <button type="button" class="option" :class="{ active: props.selected === 'system' }" @click="choose('system')">
      <span class="flag system-flag">
        <MdiIcon name="mdiCellphoneCog" :size="18" color="var(--text-secondary)" />
      </span>
      <span class="option-label">{{ t('layout.settings.languageSystem') }}</span>
      <MdiIcon v-if="props.selected === 'system'" name="mdiCheck" :size="18" color="var(--accent)" />
    </button>

    <button
      v-for="loc in LOCALES"
      :key="loc"
      type="button"
      class="option"
      :class="{ active: props.selected === loc }"
      @click="choose(loc)"
    >
      <img :src="localeFlagUrl(loc)" class="flag" :alt="LOCALE_NAMES[loc]" width="28" height="28" loading="lazy" />
      <span class="option-label">{{ LOCALE_NAMES[loc] }}</span>
      <MdiIcon v-if="props.selected === loc" name="mdiCheck" :size="18" color="var(--accent)" />
    </button>
  </Modal>
</template>

<style lang="scss" scoped>
.option {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  border: none;
  background: none;
  padding: 8px;
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

.flag {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  flex-shrink: 0;
  // Circle Flags are already circular SVGs, but a hairline ring keeps a
  // pale flag (e.g. Japan's) from blending into the surface on light theme.
  box-shadow: 0 0 0 1px var(--border);
}

.system-flag {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-2);
}

.option-label {
  flex: 1;
  min-width: 0;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-primary);
}
</style>
