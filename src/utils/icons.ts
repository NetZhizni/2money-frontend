import * as mdi from '@mdi/js'

type MdiModule = Record<string, string>
const icons = mdi as unknown as MdiModule

/** All ~7400 MDI icon names available for pickers (category/account icons). */
export const ICON_NAMES: string[] = Object.keys(icons).sort()

const FALLBACK_ICON = 'mdiHelpCircleOutline'

export function getIconPath(name: string | undefined | null): string {
  if (name && icons[name]) return icons[name]
  return icons[FALLBACK_ICON]
}

/** Human-friendly label from an mdi key, e.g. "mdiSilverwareForkKnife" -> "Silverware Fork Knife" */
export function iconLabel(name: string): string {
  return name
    .replace(/^mdi/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
}

/** Curated shortlist shown before the user types a search query (finance/lifestyle relevant). */
export const POPULAR_ICONS: string[] = [
  'mdiFridgeOutline', 'mdiSilverwareForkKnife', 'mdiCoffeeOutline', 'mdiFoodAppleOutline',
  'mdiTicketOutline', 'mdiMovieOpenOutline', 'mdiGamepadVariantOutline', 'mdiBeerOutline',
  'mdiBus', 'mdiCarOutline', 'mdiTaxi', 'mdiTrainCar', 'mdiAirplane', 'mdiGasStationOutline',
  'mdiShoppingOutline', 'mdiCartOutline', 'mdiBagPersonalOutline', 'mdiHanger', 'mdiTshirtCrewOutline',
  'mdiGiftOutline', 'mdiGiftOpenOutline', 'mdiWeb', 'mdiCellphone', 'mdiWifi',
  'mdiHomeOutline', 'mdiLightbulbOutline', 'mdiWaterOutline', 'mdiSofaOutline', 'mdiToolboxOutline',
  'mdiMedicalBag', 'mdiPill', 'mdiHeartPulse', 'mdiToothOutline', 'mdiDumbbell',
  'mdiChartLine', 'mdiSchoolOutline', 'mdiBookOpenPageVariantOutline', 'mdiEmoticonOutline',
  'mdiFaceWomanShimmerOutline', 'mdiSpa', 'mdiPaw', 'mdiBabyCarriage', 'mdiHumanMaleFemaleChild',
  'mdiCashMultiple', 'mdiBriefcaseOutline', 'mdiBank', 'mdiPiggyBankOutline', 'mdiCreditCardOutline',
  'mdiHandshakeOutline', 'mdiChartDonut', 'mdiWalletOutline', 'mdiCarWrench', 'mdiUmbrellaOutline',
  'mdiDotsHorizontalCircleOutline', 'mdiStarOutline', 'mdiHeartOutline', 'mdiPartyPopper',
]
