<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import Modal from '../common/Modal.vue'
import MdiIcon from '../common/MdiIcon.vue'

/**
 * Три способи дістати фото чека для розпізнавання (див.
 * ReceiptScanReviewModal.vue, яке отримує готовий File і шле його далі в
 * POST /api/receipts/scan): з галереї/файлів, "наживо" через камеру пристрою
 * (getUserMedia, знімок кадром у canvas — без переходу у нативний застосунок
 * камери), або з буфера обміну (скріншот чи скопійоване десь зображення).
 */
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: []; picked: [File] }>()

type Mode = 'menu' | 'camera' | 'clipboard'
const mode = ref<Mode>('menu')

const title = computed(() => {
  if (mode.value === 'camera') return 'Камера'
  if (mode.value === 'clipboard') return 'З буфера обміну'
  return 'Фото чека'
})

function emitPicked(file: File) {
  emit('picked', file)
}

// ---------- Галерея / файл ----------

const galleryInput = ref<HTMLInputElement | null>(null)
function openGallery() {
  galleryInput.value?.click()
}
function onGalleryPicked(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  input.value = ''
  if (file) emitPicked(file)
}

// ---------- Камера ----------

const cameraSupported = !!navigator.mediaDevices?.getUserMedia
const videoEl = ref<HTMLVideoElement | null>(null)
const cameraError = ref('')
const facingMode = ref<'environment' | 'user'>('environment')
let stream: MediaStream | null = null

function stopCamera() {
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
}

async function startCamera() {
  cameraError.value = ''
  stopCamera()
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facingMode.value } },
      audio: false,
    })
    await nextTick()
    if (videoEl.value) {
      videoEl.value.srcObject = stream
      await videoEl.value.play().catch(() => {})
    }
  } catch (error) {
    console.error('[receipt-capture] camera failed', error)
    cameraError.value = 'Не вдалося увімкнути камеру. Перевірте дозвіл у браузері або оберіть фото з галереї.'
  }
}

async function openCamera() {
  mode.value = 'camera'
  await startCamera()
}

async function flipCamera() {
  facingMode.value = facingMode.value === 'environment' ? 'user' : 'environment'
  await startCamera()
}

function shoot() {
  const video = videoEl.value
  if (!video || !video.videoWidth) return
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  canvas.toBlob(
    (blob) => {
      if (!blob) return
      stopCamera()
      emitPicked(new File([blob], 'receipt.jpg', { type: 'image/jpeg' }))
    },
    'image/jpeg',
    0.92,
  )
}

// ---------- Буфер обміну ----------

const clipboardError = ref('')
const clipboardManualFallback = ref(false)
const pasteTarget = ref<HTMLDivElement | null>(null)

/** `paste` event items — distinct API shape from `navigator.clipboard.read()`'s ClipboardItem[] below. */
function handlePasteEventItems(items: DataTransferItemList | undefined): boolean {
  if (!items) return false
  for (const item of items) {
    if (!item.type.startsWith('image/')) continue
    const file = item.getAsFile()
    if (file) {
      emitPicked(file)
      return true
    }
  }
  return false
}

async function tryReadClipboard() {
  clipboardError.value = ''
  clipboardManualFallback.value = false
  if (!navigator.clipboard?.read) {
    clipboardManualFallback.value = true
    return
  }
  try {
    const items = await navigator.clipboard.read()
    for (const item of items) {
      const imageType = item.types.find((t) => t.startsWith('image/'))
      if (imageType) {
        const blob = await item.getType(imageType)
        emitPicked(new File([blob], 'clipboard-image', { type: imageType }))
        return
      }
    }
    clipboardError.value = 'У буфері обміну немає зображення.'
    clipboardManualFallback.value = true
  } catch (error) {
    // Найчастіше — відмова в дозволі, або браузер узагалі не підтримує
    // navigator.clipboard.read() (типово для мобільних) — тоді єдиний
    // робочий шлях лишається нативна вставка через подію `paste`.
    console.warn('[receipt-capture] clipboard.read() unavailable, falling back to paste event', error)
    clipboardManualFallback.value = true
  }
}

async function openClipboard() {
  mode.value = 'clipboard'
  await tryReadClipboard()
  await nextTick()
  pasteTarget.value?.focus()
}

function onManualPaste(e: ClipboardEvent) {
  e.preventDefault()
  const handled = handlePasteEventItems(e.clipboardData?.items)
  if (!handled) clipboardError.value = 'У буфері обміну немає зображення.'
}

// ---------- Спільне ----------

function backToMenu() {
  stopCamera()
  mode.value = 'menu'
  cameraError.value = ''
  clipboardError.value = ''
  clipboardManualFallback.value = false
}

function requestClose() {
  stopCamera()
  emit('close')
}

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) {
      stopCamera()
      mode.value = 'menu'
    }
  },
)

// Захист, якщо сторінку покинули (зміна маршруту) просто під час зйомки —
// без цього камера лишалась би увімкненою в фоні, поки браузер не прибере
// сам MediaStream (не завжди відбувається одразу).
onUnmounted(stopCamera)
</script>

<template>
  <Modal :open="open" :title="title" @close="requestClose">
    <div v-if="mode === 'menu'" class="menu">
      <button type="button" class="source-btn" @click="openGallery">
        <span class="source-icon"><MdiIcon name="mdiImageMultipleOutline" :size="22" /></span>
        <span class="source-text">
          <span class="source-title">Обрати фото</span>
          <span class="source-sub">Із галереї чи файлів пристрою</span>
        </span>
      </button>

      <button type="button" class="source-btn" :class="{ disabled: !cameraSupported }" @click="cameraSupported && openCamera()">
        <span class="source-icon"><MdiIcon name="mdiCameraOutline" :size="22" /></span>
        <span class="source-text">
          <span class="source-title">Зробити фото</span>
          <span class="source-sub">{{ cameraSupported ? 'Увімкнути камеру' : 'Камера недоступна в цьому браузері' }}</span>
        </span>
      </button>

      <button type="button" class="source-btn" @click="openClipboard">
        <span class="source-icon"><MdiIcon name="mdiClipboardOutline" :size="22" /></span>
        <span class="source-text">
          <span class="source-title">Вставити з буфера обміну</span>
          <span class="source-sub">Скріншот або скопійоване зображення</span>
        </span>
      </button>
    </div>

    <div v-else-if="mode === 'camera'" class="camera-view">
      <div class="camera-frame">
        <video ref="videoEl" autoplay muted playsinline />
        <p v-if="cameraError" class="camera-error">{{ cameraError }}</p>
      </div>
      <div class="camera-controls">
        <button type="button" class="ctrl-btn" aria-label="Назад" @click="backToMenu">
          <MdiIcon name="mdiArrowLeft" :size="20" />
        </button>
        <button type="button" class="shutter-btn" :disabled="!!cameraError" aria-label="Зняти" @click="shoot">
          <span class="shutter-inner" />
        </button>
        <button type="button" class="ctrl-btn" aria-label="Змінити камеру" @click="flipCamera">
          <MdiIcon name="mdiCameraFlipOutline" :size="20" />
        </button>
      </div>
    </div>

    <div v-else class="clipboard-view">
      <button type="button" class="back-link" @click="backToMenu">
        <MdiIcon name="mdiArrowLeft" :size="16" />
        Назад
      </button>

      <div
        v-if="clipboardManualFallback"
        ref="pasteTarget"
        class="paste-target"
        tabindex="0"
        contenteditable="true"
        @paste="onManualPaste"
      >
        <MdiIcon name="mdiContentPaste" :size="26" color="var(--text-muted)" />
        <span>Натисніть тут і вставте (Ctrl+V), або утримуйте для вставки на телефоні</span>
      </div>
      <div v-else class="paste-waiting">
        <span class="spinner" />
        <span>Читаємо буфер обміну…</span>
      </div>

      <p v-if="clipboardError" class="clipboard-error">{{ clipboardError }}</p>
      <button type="button" class="btn btn-secondary retry-btn" @click="tryReadClipboard">Спробувати ще раз</button>
    </div>
  </Modal>

  <input ref="galleryInput" type="file" accept="image/*" class="visually-hidden" @change="onGalleryPicked" />
</template>

<style scoped>
.menu {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 4px;
}

.source-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  border: none;
  background: var(--surface-2);
  border-radius: var(--radius-md);
  padding: 12px 14px;
  cursor: pointer;
  text-align: left;
}

.source-btn.disabled {
  opacity: 0.5;
  cursor: default;
}

.source-icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent);
}

.source-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.source-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.source-sub {
  font-size: 12px;
  color: var(--text-muted);
}

.camera-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.camera-frame {
  position: relative;
  width: 100%;
  aspect-ratio: 3 / 4;
  background: #000;
  border-radius: var(--radius-md);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.camera-frame video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.camera-error {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  margin: 0;
  text-align: center;
  color: #fff;
  font-size: 13px;
  background: rgba(0, 0, 0, 0.55);
}

.camera-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 28px;
}

.ctrl-btn {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: none;
  background: var(--surface-2);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.shutter-btn {
  width: 66px;
  height: 66px;
  border-radius: 50%;
  border: 3px solid var(--accent);
  background: var(--surface);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.shutter-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.shutter-inner {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: var(--accent);
}

.shutter-btn:active .shutter-inner {
  transform: scale(0.9);
}

.clipboard-view {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.back-link {
  display: flex;
  align-items: center;
  gap: 4px;
  align-self: flex-start;
  border: none;
  background: none;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  padding: 0;
}

.paste-target {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
  padding: 28px 16px;
  border: 1.5px dashed var(--border);
  border-radius: var(--radius-md);
  color: var(--text-muted);
  font-size: 13px;
  cursor: text;
  outline: none;
}

.paste-target:focus {
  border-color: var(--accent);
}

.paste-waiting {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 28px 16px;
  color: var(--text-muted);
  font-size: 13px;
}

.spinner {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 3px solid var(--surface-2);
  border-top-color: var(--accent);
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.clipboard-error {
  margin: 0;
  font-size: 12.5px;
  color: var(--expense);
  text-align: center;
}

.retry-btn {
  width: 100%;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
