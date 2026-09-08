/** Generic app-level guard errors — defensive, not meant to reach the UI in normal operation. */
export const errors = {
  uk: {
    'errors.readOnlyProfile': 'Перегляд профілю іншого користувача доступний лише для читання',
    'errors.generic': 'Сталася помилка',
    'errors.mergeKindMismatch': 'Можна об’єднувати лише категорії одного типу (дохід/витрата)',
    'errors.mergeCurrencyMismatch': 'Можна об’єднувати лише рахунки в одній валюті',
    'errors.ownerOnly': 'Доступно лише власнику сім’ї',
  },
  en: {
    'errors.readOnlyProfile': 'Viewing another user’s profile is read-only',
    'errors.generic': 'Something went wrong',
    'errors.mergeKindMismatch': 'Only categories of the same type (income/expense) can be merged',
    'errors.mergeCurrencyMismatch': 'Only accounts in the same currency can be merged',
    'errors.ownerOnly': 'Only the family owner can do this',
  },
}
