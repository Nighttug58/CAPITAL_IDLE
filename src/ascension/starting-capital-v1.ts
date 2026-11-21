/** Exact immutable tiers, dollars converted to BigInt cents before interpolation. */
export const LEGACY_STARTING_CAPITAL_TIERS = [
  {level:0,dollars:0n},
  {level:1,dollars:10_000n},
  {level:10,dollars:1_000_000n},
  {level:50,dollars:100_000_000n},
  {level:100,dollars:1_000_000_000n},
  {level:250,dollars:100_000_000_000n},
  {level:500,dollars:10_000_000_000_000n},
  {level:1000,dollars:1_000_000_000_000_000n},
] as const
/** Null for an invalid level. Intermediate cents always floor toward zero. */
export function startingCapitalCentsLegacy(level:number):bigint|null {
  if(!Number.isSafeInteger(level)||level<0||level>1000)return null
  for(let i=1;i<LEGACY_STARTING_CAPITAL_TIERS.length;i++){
    const next=LEGACY_STARTING_CAPITAL_TIERS[i]!
    if(level>next.level)continue
    const previous=LEGACY_STARTING_CAPITAL_TIERS[i-1]!
    if(level===next.level)return next.dollars*100n
    return previous.dollars*100n+
      (next.dollars-previous.dollars)*100n*BigInt(level-previous.level)/BigInt(next.level-previous.level)
  }
  return null
}

/** 100-stage tiers preserve the old maximal award ($1 Qa).
 * Each new rank has precisely the power of ten historical ranks.
 * Legacy receipts use the original tiers above, unchanged.
 */
export const STARTING_CAPITAL_TIERS = LEGACY_STARTING_CAPITAL_TIERS.filter(tier=>tier.level%10===0).map(tier=>({
  level:tier.level/10,dollars:tier.dollars,
}))
export function startingCapitalCents(level:number, legacy=false):bigint|null {
  if(!Number.isSafeInteger(level)||level<0||level>(legacy?1000:100))return null
  return startingCapitalCentsLegacy(legacy?level:level*10)
}
