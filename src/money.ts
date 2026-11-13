/**
 * Conversion fiable de $ vers centimes lorsque les montants deviennent très
 * élevés. La précision binaire de Number diminue avec l'ordre de grandeur :
 * 69 806 801 435,15 $ peut donner 6 980 680 143 514,999 cents.
 *
 * Ne jamais accepter une vraie fraction de centime ; la tolérance est limitée
 * à 1/4 de centime et n'est utilisée que pour corriger l'imprécision flottante.
 * Toutes les écritures continuent de se faire en centimes entiers sûrs.
 */
export function exactMoneyCents(value: number): number | null {
  if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER / 100) return null
  const scaled = value * 100
  const cents = Math.round(scaled)
  const tolerance = Math.min(0.25, Math.max(0.0001, Math.abs(scaled) * Number.EPSILON * 4))
  return Number.isSafeInteger(cents) && Math.abs(scaled - cents) <= tolerance
    ? cents : null
}
