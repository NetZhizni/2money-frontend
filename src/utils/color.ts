// Color roles, following the dataviz method: fixed categorical order, never a
// generated/cycled hue for anything that must stay comparable. Category/account
// badge colors are a decorative identity pick (not a comparison chart), so cycling
// this fixed list across many user-created categories is fine — comparison charts
// (the overview bar / spending ring) instead assign each category its OWN stored
// color directly, so they never re-derive or re-cycle it.

export const CATEGORICAL: Array<{ light: string; dark: string }> = [
  { light: '#2a78d6', dark: '#3987e5' }, // blue
  { light: '#eb6834', dark: '#d95926' }, // orange
  { light: '#1baf7a', dark: '#199e70' }, // aqua
  { light: '#eda100', dark: '#c98500' }, // yellow
  { light: '#e87ba4', dark: '#d55181' }, // magenta
  { light: '#008300', dark: '#008300' }, // green
  { light: '#4a3aa7', dark: '#9085e9' }, // violet
  { light: '#e34948', dark: '#e66767' }, // red
]

export const STATUS = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
}

/** Deterministic badge color for a freshly created category/account (index = creation order). */
export function paletteColor(index: number): string {
  return CATEGORICAL[index % CATEGORICAL.length].light
}

/** Given a hex color, return an rgba() string at the given alpha (used for the 80%-opacity icon badge backgrounds). */
export function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
