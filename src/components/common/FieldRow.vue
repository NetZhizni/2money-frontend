<script setup lang="ts">
import MdiIcon from './MdiIcon.vue'

/**
 * Один рядок форми в спільному стилі "чека" (ReceiptEditModal): кругла іконка
 * зліва, дрібний лейбл над значенням, усе в одній рамці. Раніше цей вигляд
 * жив лише як локальний `.account-row` у ReceiptEditModal — тепер це спільний
 * будівельний блок для будь-якого поля форми (текстовий інпут, select,
 * textarea, чекбокс-перемикач чи кнопка-пікер), щоб усі форми проєкту
 * виглядали однаково.
 *
 * Значення передається default-слотом. Якщо це нативний
 * input/select/textarea — дайте йому клас `field-row-value` (глобальний
 * стиль, style.scss): scoped-стилі цього компонента не дотягуються до вмісту
 * слоту, бо той належить scope батьківського компонента, тож типографіку
 * значення винесено в глобальний CSS. Для статичного тексту (кнопка-пікер
 * на кшталт "Рахунок оплати") той самий клас підійде і для `<span>`.
 *
 * `tag="button"` — весь рядок клікабельний (відкриває пікер/модалку).
 * `tag="label"` — рядок — це `<label>`, клік будь-де перемикає вкладений
 * `<input type="checkbox">` (перемикач у слоті `trailing`).
 * `tag="div"` (за замовчуванням) — просто контейнер навколо інпута.
 *
 * `label` необов'язковий: коли рядок сам по собі є значенням без окремого
 * підпису (наприклад перемикач "Враховувати в загальному балансі" — сам
 * текст і є вмістом, а не підписом до чогось), пропустіть `label` і віддайте
 * текст у слот класом `field-row-value` — він же й відцентрується вертикально.
 */
withDefaults(
  defineProps<{
    icon: string
    iconColor?: string
    label?: string
    tag?: 'div' | 'button' | 'label'
    disabled?: boolean
  }>(),
  { tag: 'div' },
)
</script>

<template>
  <component
    :is="tag"
    class="field-row"
    :type="tag === 'button' ? 'button' : undefined"
    :disabled="tag === 'button' ? disabled : undefined"
  >
    <span class="field-row-icon">
      <MdiIcon :name="icon" :size="18" :color="iconColor ?? 'var(--text-secondary)'" />
    </span>
    <span class="field-row-body" :class="{ centered: !label }">
      <span v-if="label" class="field-row-label">{{ label }}</span>
      <slot />
    </span>
    <slot name="trailing" />
  </component>
</template>

<style lang="scss" scoped>
.field-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  // Lets the row shrink below a native <select>/<input>'s intrinsic content
  // width when it sits in a flex/grid column (e.g. AccountFormModal's
  // .row-2) — grid/flex items default to their content's natural min-width.
  min-width: 0;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  margin-bottom: 6px;
  text-align: left;
  font: inherit;
  color: inherit;
  @include transition(border-color);
}

.field-row:focus-within {
  border-color: var(--accent);
}

button.field-row,
label.field-row {
  cursor: pointer;
}

button.field-row:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.field-row-icon {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  display: flex;
  align-items: center;
  justify-content: center;
}

.field-row-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.field-row-body.centered {
  justify-content: center;
}

.field-row-label {
  font-size: 11px;
  color: var(--text-muted);
}
</style>
