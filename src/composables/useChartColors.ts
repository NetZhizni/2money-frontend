import { onUnmounted, ref, watch } from 'vue'
import { useSettingsStore } from '../stores/settings'

export interface ChartColors {
  accent: string
  expense: string
  income: string
  transfer: string
  textPrimary: string
  textSecondary: string
  textMuted: string
  border: string
  surface: string
  surface2: string
}

function readColors(): ChartColors {
  const cs = getComputedStyle(document.documentElement)
  const v = (name: string) => cs.getPropertyValue(name).trim()
  return {
    accent: v('--accent'),
    expense: v('--expense'),
    income: v('--income'),
    transfer: v('--transfer'),
    textPrimary: v('--text-primary'),
    textSecondary: v('--text-secondary'),
    textMuted: v('--text-muted'),
    border: v('--border'),
    surface: v('--surface'),
    surface2: v('--surface-2'),
  }
}

/**
 * ApexCharts needs literal color strings (it can't resolve CSS custom
 * properties the way native CSS does), so this reads the app's actual design
 * tokens via `getComputedStyle` and re-reads them whenever the effective
 * theme changes (explicit light/dark choice, or the OS scheme when the
 * setting is "system") — keeping charts in sync with the rest of the UI
 * without duplicating the palette from style.css.
 */
export function useChartColors() {
  const settings = useSettingsStore()
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const colors = ref<ChartColors>(readColors())

  function effectiveMode(): 'light' | 'dark' {
    if (settings.theme === 'system') return media.matches ? 'dark' : 'light'
    return settings.theme
  }
  const mode = ref<'light' | 'dark'>(effectiveMode())

  function refresh() {
    mode.value = effectiveMode()
    colors.value = readColors()
  }

  media.addEventListener('change', refresh)
  const stopWatch = watch(() => settings.theme, refresh)
  onUnmounted(() => {
    media.removeEventListener('change', refresh)
    stopWatch()
  })

  return { colors, mode }
}
