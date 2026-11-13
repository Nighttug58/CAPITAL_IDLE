// Contrat d'entrée locale de l'UI : aucune notation scientifique implicite,
// ni quantité tronquée silencieusement. Le moteur reste l'autorité finale.
export function parseTradeQuantity(input: string): number {
  const text = input.trim().replace(',', '.')
  if (!/^\d+(?:\.\d+)?$/.test(text)) return Number.NaN
  const value = Number(text)
  return Number.isFinite(value) && value > 0 ? value : Number.NaN
}

export function formatEditableQuantity(value: number, decimals: number): string {
  if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(decimals) || decimals < 0 || decimals > 8) return ''
  const fixed = value.toFixed(decimals)
  return fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed
}
