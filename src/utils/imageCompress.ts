/**
 * Стискає фото на клієнті перед відправкою на POST /api/receipts/scan —
 * фото з камери телефону легко буває 3000×4000px і кілька мегабайтів, а для
 * розпізнавання чека Gemini вистачає набагато меншої роздільності. Менший
 * payload — це і швидший запит, і менший ліміт тіла запиту на бекенді.
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
    if (!ctx) throw new Error('Canvas 2D недоступний')
    ctx.drawImage(bitmap, 0, 0, width, height)

    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
    return { base64, mimeType: 'image/jpeg' }
  } finally {
    bitmap.close()
  }
}
