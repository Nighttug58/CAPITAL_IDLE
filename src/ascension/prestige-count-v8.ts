/**
 * V8 remains version 8. Historical small cycle indices keep their original
 * numeric representation; after Number.MAX_SAFE_INTEGER the canonical
 * decimal-string counter and receipt index are authoritative.
 */
export const MAX_SAFE_CYCLE = BigInt(Number.MAX_SAFE_INTEGER)

export interface ExactPrestigeCounter {
  readonly prestigeCount: number
  readonly prestigeCountExact?: string
}
export function prestigeCycleCount(progress: ExactPrestigeCounter): bigint {
  return progress.prestigeCountExact === undefined
    ? BigInt(progress.prestigeCount)
    : BigInt(progress.prestigeCountExact)
}
export function projectedPrestigeCycle(value: bigint): number {
  return Number(value > MAX_SAFE_CYCLE ? MAX_SAFE_CYCLE : value)
}
export function nextPrestigeCycle(progress: ExactPrestigeCounter) {
  const exact = prestigeCycleCount(progress) + 1n
  return {
    prestigeCount: projectedPrestigeCycle(exact),
    ...(exact > MAX_SAFE_CYCLE || progress.prestigeCountExact !== undefined
      ? { prestigeCountExact: exact.toString() } : {}),
    cycleExact: exact,
  }
}
