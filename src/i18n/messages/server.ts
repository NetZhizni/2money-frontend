export const serverMessages = {
  uk: {
    'server.setup.title': '2Money',
    'server.setup.hint':
      'Вкажіть адресу свого сервера 2Money, щоб отримати синхронізацію між пристроями й розпізнавання чеків.',
    'server.setup.urlLabel': 'Адреса сервера',
    'server.setup.urlPlaceholder': 'money.example.com',
    'server.setup.connectButton': 'Підключитись',
    'server.setup.connecting': 'Перевірка сервера…',
    'server.setup.orDivider': 'або',
    'server.setup.localButton': 'Працювати офлайн, без сервера',
    'server.setup.localHint':
      'Дані зберігатимуться лише на цьому пристрої — без синхронізації з іншими пристроями й без розпізнавання чеків. Сервер можна буде підключити пізніше, у Налаштуваннях.',
    'server.errorUnreachable': 'Сервер недоступний. Перевірте адресу та з’єднання з інтернетом.',
    'server.errorInvalid': 'Це не схоже на сервер 2Money. Перевірте адресу.',
    'server.errorUnknown': 'Не вдалося підключитись. Спробуйте ще раз.',

    'server.settings.section': 'Сервер',
    'server.settings.currentRemote': 'Підключено до',
    'server.settings.currentLocal': 'Офлайн-режим (без сервера)',
    'server.settings.receiptScanningOff': 'Цей сервер не налаштований для розпізнавання чеків.',
    'server.settings.changeLabel': 'Нова адреса сервера',
    'server.settings.changeButton': 'Змінити сервер',
    'server.settings.goLocalButton': 'Перейти в офлайн-режим',
    'server.settings.goRemoteHint': 'Цей пристрій зараз працює офлайн, без сервера.',
    'server.settings.hint': 'Зміна сервера очищає локальні дані цього пристрою — див. попередження нижче.',

    'server.switchConfirmTitle': 'Змінити сервер?',
    'server.switchConfirmMessage':
      'Локальні дані цього пристрою будуть очищені й замінені даними нового сервера. Спробуємо спершу доставити незбережені зміни на поточний сервер, але надійніше зробити резервну копію заздалегідь: Налаштування → Дані → Експорт JSON.',
    'server.switchConfirmButton': 'Очистити й підключити',
    'server.goLocalConfirmTitle': 'Перейти в офлайн-режим?',
    'server.goLocalConfirmMessage':
      'Локальні дані, синхронізовані із сервером, будуть очищені на цьому пристрої (на сервері вони лишаться недоторканими). Радимо спершу зробити резервну копію: Налаштування → Дані → Експорт JSON.',
    'server.goLocalConfirmButton': 'Перейти в офлайн',
    'server.switching': 'Перемикання…',
    'server.switchFailed': 'Не вдалося підключитись до нового сервера — попередній залишається підключеним.',

    'server.pendingOutboxTitle': 'Є незбережені зміни',
    'server.pendingOutboxOwn':
      'Не вдалося надіслати {count} {label} з ваших власних змін на поточний сервер прямо зараз (немає з’єднання?) — вони збережуться лише в автоматично завантаженому файлі бекапу, а не на сервері.',
    'server.pendingOutboxForeign':
      'На цьому пристрої є {count} {label} іншого учасника сім’ї, які ще не надіслані на сервер — надіслати їх звідси неможливо без входу в його акаунт.',
    'server.pendingOutboxButton': 'Все одно продовжити',
  },
  en: {
    'server.setup.title': '2Money',
    'server.setup.hint': 'Point this device at your 2Money server to get sync across devices and receipt scanning.',
    'server.setup.urlLabel': 'Server address',
    'server.setup.urlPlaceholder': 'money.example.com',
    'server.setup.connectButton': 'Connect',
    'server.setup.connecting': 'Checking server…',
    'server.setup.orDivider': 'or',
    'server.setup.localButton': 'Work offline, without a server',
    'server.setup.localHint':
      'Data stays on this device only — no sync with other devices, no receipt scanning. You can connect a server later, from Settings.',
    'server.errorUnreachable': 'Server unreachable. Check the address and your internet connection.',
    'server.errorInvalid': 'That doesn’t look like a 2Money server. Check the address.',
    'server.errorUnknown': 'Couldn’t connect. Please try again.',

    'server.settings.section': 'Server',
    'server.settings.currentRemote': 'Connected to',
    'server.settings.currentLocal': 'Offline mode (no server)',
    'server.settings.receiptScanningOff': 'This server isn’t set up for receipt scanning.',
    'server.settings.changeLabel': 'New server address',
    'server.settings.changeButton': 'Change server',
    'server.settings.goLocalButton': 'Switch to offline mode',
    'server.settings.goRemoteHint': 'This device is currently offline, with no server connected.',
    'server.settings.hint': 'Changing the server clears this device’s local data — see the warning below.',

    'server.switchConfirmTitle': 'Change server?',
    'server.switchConfirmMessage':
      'This device’s local data will be cleared and replaced with the new server’s. Any unsynced changes get one last attempt to reach the current server first, but a backup beforehand is safer: Settings → Data → Export JSON.',
    'server.switchConfirmButton': 'Clear and connect',
    'server.goLocalConfirmTitle': 'Switch to offline mode?',
    'server.goLocalConfirmMessage':
      'This device’s server-synced local data will be cleared (the server itself is untouched). A backup beforehand is recommended: Settings → Data → Export JSON.',
    'server.goLocalConfirmButton': 'Go offline',
    'server.switching': 'Switching…',
    'server.switchFailed': 'Couldn’t connect to the new server — staying on the previous one.',

    'server.pendingOutboxTitle': 'Unsent changes',
    'server.pendingOutboxOwn':
      'Couldn’t send {count} {label} of your own changes to the current server right now (no connection?) — they’ll only survive in the automatically downloaded backup file, not on the server.',
    'server.pendingOutboxForeign':
      'This device has {count} {label} queued by another family member that haven’t reached the server yet — they can’t be sent from here without signing into their account.',
    'server.pendingOutboxButton': 'Continue anyway',
  },
}
