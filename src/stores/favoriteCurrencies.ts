import { defineStore } from 'pinia'
import { ref } from 'vue'

const STORAGE_KEY = '2money:favoriteCurrencies'
const DEFAULT_FAVORITES = ['UAH', 'USD', 'EUR']

function readStored(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return [...DEFAULT_FAVORITES]
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((c) => typeof c === 'string') : [...DEFAULT_FAVORITES]
  } catch {
    return [...DEFAULT_FAVORITES]
  }
}

/**
 * Which currencies the currency picker pins to the top of its list — a
 * per-device display preference, like `displayCurrency`'s override, so it
 * lives in localStorage rather than going through settings/Dexie/the backend.
 * Unlike the override, this one is worth keeping across reloads: it's a
 * one-time setup a user shouldn't have to redo every session.
 */
export const useFavoriteCurrenciesStore = defineStore('favoriteCurrencies', () => {
  const codes = ref<string[]>(readStored())

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(codes.value))
  }

  function isFavorite(code: string): boolean {
    return codes.value.includes(code)
  }

  function toggle(code: string) {
    codes.value = isFavorite(code) ? codes.value.filter((c) => c !== code) : [...codes.value, code]
    persist()
  }

  return { codes, isFavorite, toggle }
})
