import { t } from '../i18n'

/**
 * Compresses the photo client-side before sending it to POST
 * /api/receipts/scan — a phone camera photo is easily 3000×4000px and
 * several megabytes, while Gemini needs a much lower resolution to read a
 * receipt. A smaller payload means both a faster request and staying under
 * the backend's request-body limit.
 */
export async function compressImageToBase64(
  file: File,
  { maxDimension = 1600, quality = 0.82 }: { maxDimension?: number; quality?: number } = {},
): Promise<{ base64: string; mimeType: string }> {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error(t('receipts.canvasUnavailable'))
    ctx.drawImage(bitmap, 0, 0, width, height)

    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
    return { base64, mimeType: 'image/jpeg' }
  } finally {
    bitmap.close()
  }
}
