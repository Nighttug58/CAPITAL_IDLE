import type { AssetKind } from './types.ts'

// Slowly changing fundamental anchored to the catalog, not to speculative spot prices.
// All limits here constrain forces or the fundamental, never the traded spot price.
const config = {
  stock: {"anchor":0.7,"dead":0.4054651081081644,"panic":1.791759469228055,"strength":0.025,"extra":0.08},
  crypto: {"anchor":1.1,"dead":0.6931471805599453,"panic":2.995732273553991,"strength":0.018,"extra":0.06},
  memecoin: {"anchor":1.6,"dead":1.0986122886681098,"panic":4.605170185988092,"strength":0.012,"extra":0.055},
} as const

export function valuation(kind: AssetKind, previous: number, price: number, reference: number, noise: number, news: number){
 const p=config[kind];
 const fundamentalLog=Math.max(-p.anchor,Math.min(p.anchor,previous*.9992+noise*.04+Math.max(-3,Math.min(3,news))*.00035));
 const gap=Math.log(price)-Math.log(reference)-fundamentalLog;
 const distance=Math.abs(gap);
 const gravity=Math.sign(gap)*Math.min(.48,Math.max(0,distance-p.dead)*p.strength+Math.max(0,distance-p.panic)*p.extra);
 const bubble=Math.max(0,gap-p.panic);
 return {fundamentalLog,gravity,extraShock:Math.min(.012,bubble*.0015),crashBias:Math.min(.45,bubble*.06)};
}
