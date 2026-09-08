<script setup lang="ts">
import { ref } from 'vue'
import MdiIcon from '../components/common/MdiIcon.vue'
import { isFamilyBackup, mergeBackupFile, restoreFamilyBackup } from '../db/backup'
import { fullSync } from '../db/sync'
import { useAuthStore } from '../stores/auth'
import { t } from '../i18n'

/**
 * "Start fresh or import a backup?" — shown once per profile, the very
 * first time it has no accounts/transactions of its own yet (see
 * db/onboarding.ts's hasNoOwnDataYet, which App.vue gates this on). Analogous
 * to Home Assistant's "restore from backup" step during initial setup:
 * rather than silently seeding an empty family (see db/seed.ts's
 * seedDefaultsIfEmpty, which still runs after every choice below), this
 * gives whoever's signing in a chance to bring their history along instead.
 * Three ways to do that, in increasing scope:
 *  - Your own personal export (exportData()/mergeBackupFile()).
 *  - Your own slice of a whole-family backup (exportFamilyBackup(), see its
 *    own doc comment) taken from a server the family is moving away from —
 *    same mergeBackupFile() entry point, it detects which shape it got.
 *  - The owner-only option to restore that SAME whole-family file for
 *    EVERYONE at once (restoreFamilyBackup()) — the natural moment for it,
 *    since this screen already means "this family has nothing here yet".
 */
const emit = defineEmits<{ done: [] }>()
const authStore = useAuthStore()

const importing = ref(false)
const error = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const familyRestoreFileInput = ref<HTMLInputElement | null>(null)

function startFresh() {
  emit('done')
}

function triggerImport() {
  error.value = ''
  fileInput.value?.click()
}

async function handleFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // lets the same file be re-picked if this attempt fails
  if (!file) return
  importing.value = true
  error.value = ''
  try {
    const text = await file.text()
    const payload = JSON.parse(text)
    await mergeBackupFile(payload)
    emit('done')
  } catch (err) {
    error.value = t('onboarding.importError', { message: (err as Error).message })
    importing.value = false
  }
}

function triggerFamilyRestore() {
  error.value = ''
  familyRestoreFileInput.value?.click()
}

/**
 * Owner-only "restore the whole family" — see restoreFamilyBackup()'s own
 * doc comment. Unlike handleFile() above, this writes to the SERVER first
 * (everyone's data, not just this profile's), so a fullSync() right after
 * is what actually brings any of it down into this device's own local
 * cache — restoreFamilyBackup() alone wouldn't be visible here otherwise.
 */
async function handleFamilyRestoreFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  importing.value = true
  error.value = ''
  try {
    const text = await file.text()
    const payload = JSON.parse(text)
    if (!isFamilyBackup(payload)) throw new Error(t('sync.unsupportedBackupFormat'))
    await restoreFamilyBackup(payload)
    await fullSync(authStore.uid)
    emit('done')
  } catch (err) {
    error.value = t('onboarding.importError', { message: (err as Error).message })
    importing.value = false
  }
}
</script>

<template>
  <div class="onboarding-shell">
    <div class="card">
      <MdiIcon name="mdiDatabaseImportOutline" :size="48" color="var(--accent)" />
      <h1>{{ t('onboarding.title') }}</h1>
      <p class="hint">{{ t('onboarding.hint') }}</p>

      <button type="button" class="btn btn-primary fresh-btn" :disabled="importing" @click="startFresh">
        {{ t('onboarding.freshButton') }}
      </button>
      <p class="hint">{{ t('onboarding.freshHint') }}</p>

      <div class="divider"><span>{{ t('server.setup.orDivider') }}</span></div>

      <button type="button" class="btn btn-secondary import-btn" :disabled="importing" @click="triggerImport">
        {{ importing ? t('onboarding.importing') : t('onboarding.importButton') }}
      </button>
      <p class="hint">{{ t('onboarding.importHint') }}</p>
      <input ref="fileInput" type="file" accept="application/json" hidden @change="handleFile" />

      <template v-if="authStore.isOwner">
        <div class="divider"><span>{{ t('server.setup.orDivider') }}</span></div>

        <button type="button" class="btn btn-secondary import-btn" :disabled="importing" @click="triggerFamilyRestore">
          {{ importing ? t('onboarding.restoringFamily') : t('onboarding.restoreFamilyButton') }}
        </button>
        <p class="hint">{{ t('onboarding.restoreFamilyHint') }}</p>
        <input ref="familyRestoreFileInput" type="file" accept="application/json" hidden @change="handleFamilyRestoreFile" />
      </template>

      <p v-if="error" class="error">{{ error }}</p>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.onboarding-shell {
  min-height: 100vh;
  min-height: 100dvh;
  @include overflow(y);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
  max-width: 360px;
  width: 100%;
}

.card h1 {
  margin: 4px 0 0;
  font-size: 22px;
}

.hint {
  color: var(--text-secondary);
  font-size: 14px;
  margin: 0 0 8px;
}

.fresh-btn,
.import-btn {
  width: 100%;
  margin-top: 4px;
}

.error {
  color: var(--expense);
  font-size: 13px;
  margin: 4px 0 0;
}

.divider {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-muted);
  font-size: 12px;
  margin: 14px 0;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border);
}
</style>
