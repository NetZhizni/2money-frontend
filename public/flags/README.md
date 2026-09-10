# Flags

20 flag icons (one per supported language, named by locale code — see
`src/i18n/locale.ts`'s `LOCALES`) vendored from the **Circle Flags** project:

https://github.com/HatScripts/circle-flags — MIT License, © HatScripts.

Vendored locally (rather than loaded from a CDN at request time) so the flag
picker keeps working offline in the installed PWA, and so no third-party
request is made just to render the language picker.

To refresh or add a flag: `npm pack circle-flags` and copy the wanted
`flags/<ISO-3166-1 country code>.svg` here as `<locale code>.svg` — see the
locale → country mapping in `src/i18n/locale.ts`'s `LOCALE_META`.
