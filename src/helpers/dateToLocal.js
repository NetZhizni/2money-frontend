const locale = 'uk-UA'
/**
 * Перетворює дату в локальний формат.
 * @param {Date|string} DATE - Дата для перетворення або рядок дати у форматі ISO 8601.
 * @param {Object} [options] - Об'єкт з налаштуваннями форматування дати.
 * @param {string} [options.dateStyle='short'] - Стиль форматування дати.
 *   Валідні варіанти: 'full', 'long', 'medium', 'short'.
 * @param {string} [options.timeStyle='short'] - Стиль форматування часу.
 *   Валідні варіанти: 'full', 'long', 'medium', 'short'.
 * @param {string} [options.all] - Стиль форматування дати та часу.
 *   Валідні варіанти: 'full', 'long', 'medium', 'short'.
 *   Якщо встановлено цей параметр, то dateStyle та timeStyle будуть ігноруватися.
 * @return {string|null} Форматовану дату або null, якщо DATE не є дійсною датою.
 */
const dateToLocal = (DATE, options = {}) => {
  if (DATE) {
    const date = new Date(DATE)
    const test = new Intl.DateTimeFormat(locale, {
      dateStyle: options?.dateStyle || options?.all || 'short',
      timeStyle: options?.timeStyle || options?.all,
    }).format(date)
    return test
  }
  return null
}

export default dateToLocal
