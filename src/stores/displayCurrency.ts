import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useSettingsStore } from './settings'

/**
 * A view-only currency override for the header/analytics totals — separate
 * from `settings.baseCurrency` (which is the persisted "reporting currency"
 * used to store historical baseAmount snapshots). Switching this lets the
 * user glance at "what's my net worth in USD today" without touching the
 * app's actual base-currency setting. Resets to the base currency on reload.
 */
export const useDisplayCurrencyStore = defineStore('displayCurrency', () => {
  const settings = useSettingsStore()
  const override = ref<string | null>(null)

  const effective = computed(() => override.value ?? settings.baseCurrency)
  const isOverridden = computed(() => override.value != null && override.value !== settings.baseCurrency)

  function set(code: string | null) {
    override.value = code
  }
  function reset() {
    override.value = null
  }

  return { override, effective, isOverridden, set, reset }
})
