/**
 * Reader-only compatibility for V7/V8 saves written before free-floating prices.
 * Former timed boundary events must validate before migration, but are never
 * persisted into newly restored quotes or executed by the market engine.
 */
import type {AssetDefinition} from './types.ts'

export function validLegacyBoundary(value:unknown,asset:AssetDefinition,price:number,updatedAt:number):boolean {
  if(!value || typeof value!=='object' || Array.isArray(value))return false
  const event=value as Record<string,unknown>
  if(event.side!=='min' && event.side!=='max')return false
  const start=event.touchedAtRealMs,hold=event.holdUntilRealMs
  const end=event.reboundUntilRealMs,target=event.reboundTargetPrice
  if(![start,hold,end].every(x=>Number.isSafeInteger(x)&&typeof x==='number'&&x>=0)||
    typeof start!=='number'||typeof hold!=='number'||typeof end!=='number'||
    typeof target!=='number'||!Number.isFinite(target)||start>updatedAt||
    hold-start<300_000||hold-start>600_000||end-hold<60_000||end-hold>180_000||
    updatedAt>=end)return false
  const min=asset.referencePrice*(asset.kind==='stock'?0.10:0.05)
  const max=asset.referencePrice*(asset.kind==='stock'?6:5)
  if(target<min||target>max)return false
  const edge=event.side==='min'?min:max
  if(event.side==='min'?target<=edge:target>=edge)return false
  if(updatedAt<hold)return price===edge
  const expected=edge+(target-edge)*(updatedAt-hold)/(end-hold)
  return Math.abs(price-expected)<=Math.max(1e-12,Math.abs(expected)*1e-12)
}
/** Remove obsolete event metadata without changing price, history or RNG seed. */
export function stripLegacyBoundaries<T extends {quotes:Record<string,any>}>(trading:T):T {
  if(!Object.values(trading.quotes).some(q=>q && typeof q==='object' && Object.hasOwn(q,'boundary')))return trading
  const quotes=Object.fromEntries(Object.entries(trading.quotes).map(([id,quote])=>{
    const {boundary:_ignored,...rest}=quote as Record<string,unknown>
    return [id,rest]
  }))
  return {...trading,quotes} as T
}
