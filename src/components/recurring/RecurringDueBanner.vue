<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import MdiIcon from '../common/MdiIcon.vue'
import { useTemplatesStore } from '../../stores/templates'
import { useViewAsStore } from '../../stores/viewAs'
import { occurrencesBetween } from '../../db/recurring'
import { t } from '../../i18n'

// A requireConfirm template's due occurrences only ever wait on the Recurring
// page (see db/recurring.ts's generateDueRecurring) — this is what makes sure
// they're noticed without anyone having to go looking there.
const templates = useTemplatesStore()
const viewAs = useViewAsStore()
const router = useRouter()

const dueCount = computed(() => {
  const now = Date.now()
  return templates.all
    .filter((tpl) => tpl.requireConfirm)
    .reduce((sum, tpl) => sum + occurrencesBetween(tpl, -Infinity, now).length, 0)
})
</script>

<template>
  <button v-if="dueCount && !viewAs.isReadOnly" type="button" class="due-banner" @click="router.push('/recurring')">
    <MdiIcon name="mdiBellRingOutline" :size="18" color="var(--accent)" />
    <span class="text">{{ t('recurring.banner', { count: dueCount }) }}</span>
    <MdiIcon name="mdiChevronRight" :size="18" color="var(--text-muted)" />
  </button>
</template>

<style scoped>
.due-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin-bottom: 10px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}
.text {
  flex: 1;
  min-width: 0;
}
</style>
