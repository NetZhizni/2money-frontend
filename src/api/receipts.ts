import http from './http'

/**
 * Один пункт, на які бекенд розбив чек (див. backend/src/services/internal/
 * receipt/scanReceipt.js) — ще НЕ справжня Transaction: без id/рахунку/
 * валюти, поки користувач не збереже її (див. ReceiptScanReviewModal.vue).
 */
export interface ScannedOperation {
  type: 'expense' | 'income'
  note: string | null
  amount: number
  categoryId: string | null
  subcategoryId: string | null
}

export interface ScanReceiptResult {
  merchant: string | null
  date: number | null // epoch ms, або null, якщо дату не розпізнано
  currency: string | null // лише інформативно — розпізнані суми зберігаються у валюті обраного рахунку, як і в ручній формі
  operations: ScannedOperation[]
}

/**
 * POST /api/receipts/scan — надсилає фото чека, повертає розпізнаний
 * чернетковий список операцій (нічого не зберігається на бекенді).
 */
export async function scanReceipt(imageBase64: string, mimeType: string): Promise<ScanReceiptResult> {
  const { data } = await http.post<ScanReceiptResult>('/receipts/scan', { image: imageBase64, mimeType })
  return data
}
