<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import FieldRow from '../common/FieldRow.vue'
import Modal from '../common/Modal.vue'
import MdiIcon from '../common/MdiIcon.vue'
import Segmented from '../common/Segmented.vue'
import OptionListModal, { type ListOption } from '../common/OptionListModal.vue'
import { RECURRENCE_PRESETS, isPreset, recurrenceLabel, recurrencePreview, unitWord } from '../../utils/recurrence'
import { t } from '../../i18n'
import type { RecurringFrequency } from '../../types/models'

// How often a recurring operation repeats — frequency and interval as ONE
// field (see utils/recurrence.ts's presets): the common schedules are a
// single tap in the same OptionListModal the rest of the app's small
// choices use, each with a preview of the dates it produces; anything else
// ("every 5 days", "every 10 weeks") is a custom interval, set with a
// stepper instead of a bare number input.
const props = defineProps<{
  frequency: RecurringFrequency
  interval: number
  // The previews count from here — the operation's own date, or a
  // template's next one.
  start: number
  // For the currently saved schedule only: its own anchor (see
  // RecurringTemplate.startDate), when that differs from `start`.
  anchor?: number
}>()
const emit = defineEmits<{ 'update:frequency': [RecurringFrequency]; 'update:interval': [number] }>()

const MAX_INTERVAL = 99
const CUSTOM = 'custom'

const showList = ref(false)
const showCustom = ref(false)

const summary = computed(() => recurrenceLabel(props.frequency, props.interval))

function anchorFor(frequency: RecurringFrequency, interval: number): number | undefined {
  return frequency === props.frequency && interval === props.interval ? props.anchor : undefined
}

const valueOf = (frequency: RecurringFrequency, interval: number) => `${frequency}:${interval}`
const selected = computed(() => (isPreset(props.frequency, props.interval) ? valueOf(props.frequency, props.interval) : CUSTOM))

const options = computed<ListOption[]>(() => [
  ...RECURRENCE_PRESETS.map((p) => ({
    value: valueOf(p.frequency, p.interval),
    label: recurrenceLabel(p.frequency, p.interval),
    sublabel: recurrencePreview(p.frequency, p.interval, props.start, anchorFor(p.frequency, p.interval)),
  })),
  {
    value: CUSTOM,
    label: t('recurring.preset.custom'),
    sublabel: selected.value === CUSTOM ? summary.value : undefined,
  },
])

function set(frequency: RecurringFrequency, interval: number) {
  emit('update:frequency', frequency)
  emit('update:interval', interval)
}

// OptionListModal closes itself right after `select` — the custom editor
// only opens once that close has flushed (same modal-swap rule as App.vue's
// handleTransactionDeleteRequest).
async function choose(value: string) {
  if (value !== CUSTOM) {
    const [frequency, interval] = value.split(':')
    set(frequency as RecurringFrequency, Number(interval))
    return
  }
  draftUnit.value = props.frequency
  draftInterval.value = Math.min(MAX_INTERVAL, Math.max(1, props.interval))
  await nextTick()
  showCustom.value = true
}

// ---------- custom interval ----------

const draftUnit = ref<RecurringFrequency>('daily')
const draftInterval = ref(1)

const unitOptions = computed(() => [
  { value: 'daily', label: t('recurring.unitName.day') },
  { value: 'weekly', label: t('recurring.unitName.week') },
  { value: 'monthly', label: t('recurring.unitName.month') },
  { value: 'yearly', label: t('recurring.unitName.year') },
])

const draftPreview = computed(() =>
  recurrencePreview(draftUnit.value, draftInterval.value, props.start, anchorFor(draftUnit.value, draftInterval.value)),
)

function step(delta: number) {
  draftInterval.value = Math.min(MAX_INTERVAL, Math.max(1, draftInterval.value + delta))
}

function applyCustom() {
  set(draftUnit.value, draftInterval.value)
  showCustom.value = false
}
</script>

<template>
  <FieldRow tag="button" icon="mdiCalendarSyncOutline" :label="t('transactions.form.frequencyLabel')" @click="showList = true">
    <span class="field-row-value">{{ summary }}</span>
    <template #trailing>
      <MdiIcon name="mdiChevronDown" :size="18" color="var(--text-muted)" />
    </template>
  </FieldRow>

  <OptionListModal
    :open="showList"
    :title="t('transactions.form.frequencyLabel')"
    :options="options"
    :selected="selected"
    @close="showList = false"
    @select="choose"
  />

  <Modal :open="showCustom" :title="t('recurring.custom.title')" @close="showCustom = false">
    <div class="stepper">
      <button type="button" class="step-btn" :disabled="draftInterval <= 1" :aria-label="t('recurring.custom.decrease')" @click="step(-1)">
        <MdiIcon name="mdiMinus" :size="22" />
      </button>
      <div class="step-value">
        <span class="step-number">{{ draftInterval }}</span>
        <span class="step-unit">{{ unitWord(draftUnit, draftInterval) }}</span>
      </div>
      <button type="button" class="step-btn" :disabled="draftInterval >= MAX_INTERVAL" :aria-label="t('recurring.custom.increase')" @click="step(1)">
        <MdiIcon name="mdiPlus" :size="22" />
      </button>
    </div>

    <Segmented class="unit-toggle" :model-value="draftUnit" :options="unitOptions" @update:model-value="(v) => (draftUnit = v as RecurringFrequency)" />

    <div class="custom-summary">
      <span class="custom-label">{{ recurrenceLabel(draftUnit, draftInterval) }}</span>
      <span class="custom-preview">{{ draftPreview }}</span>
    </div>

    <button type="button" class="btn btn-primary done" @click="applyCustom">{{ t('common.done') }}</button>
  </Modal>
</template>

<style scoped>
.stepper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: var(--surface-2);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  margin-bottom: 12px;
}

.step-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border: none;
  border-radius: 50%;
  background: var(--surface);
  color: var(--text-primary);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
}

.step-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.step-value {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 8px;
  min-width: 0;
}

.step-number {
  font-size: 32px;
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.step-unit {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-secondary);
}

.unit-toggle {
  margin-bottom: 12px;
}

.custom-summary {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 4px;
  margin-bottom: 16px;
}

.custom-label {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-primary);
}

.custom-preview {
  font-size: 12px;
  color: var(--text-muted);
}

.done {
  width: 100%;
}
</style>
