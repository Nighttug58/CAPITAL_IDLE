/** Exact immutable tiers, dollars converted to BigInt cents before interpolation. */
export const STARTING_CAPITAL_TIERS = [
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
export function startingCapitalCents(level:number):bigint|null {
  if(!Number.isSafeInteger(level)||level<0||level>1000)return null
  for(let i=1;i<STARTING_CAPITAL_TIERS.length;i++){
    const next=STARTING_CAPITAL_TIERS[i]!
    if(level>next.level)continue
    const previous=STARTING_CAPITAL_TIERS[i-1]!
    if(level===next.level)return next.dollars*100n
    return previous.dollars*100n+
      (next.dollars-previous.dollars)*100n*BigInt(level-previous.level)/BigInt(next.level-previous.level)
  }
  return null
}
