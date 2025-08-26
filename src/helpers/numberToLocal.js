const locale = 'uk-UA'

const currencyFormatter = (currency) => {
  const formatterUAH = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'UAH',
    currencyDisplay: 'narrowSymbol', // інші варіанти: 'code', 'name', 'symbol'
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
  return formatterUAH.format(currency)
}

const percentFormatter = (percent) => {
  const formatterPercent = new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
  return formatterPercent.format(percent)
}

const integerFormatter = (currency) => {
  const formatterUAH = new Intl.NumberFormat(locale, {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
  return formatterUAH.format(currency)
}

export { currencyFormatter, percentFormatter, integerFormatter }
