/** Ordered exactly like the six primary buttons in the bottom navigation. */
export const PRIMARY_PAGES = ['home','trading','enterprises','collection','achievements','stats'] as const
export type PrimaryPage = typeof PRIMARY_PAGES[number]
export const SWIPE_THRESHOLD_PX = 70
export const SWIPE_FLICK_DISTANCE_PX = 26
export const SWIPE_FLICK_VELOCITY_PX_PER_MS = 0.5
export const NAV_ADJACENT_MS = 220
export const NAV_PASS_THROUGH_MS = 105
export const NAV_LAST_HOP_MS = 155

export function isPrimaryPage(value:string):value is PrimaryPage {
  return (PRIMARY_PAGES as readonly string[]).includes(value)
}
export function adjacentPage(from:PrimaryPage, direction:-1|1):PrimaryPage|null {
  return PRIMARY_PAGES[PRIMARY_PAGES.indexOf(from)+direction] ?? null
}
/** Always cross each primary page in actual navigation-bar order; no wrapping. */
export function nextPageToward(from:PrimaryPage,to:PrimaryPage):PrimaryPage|null {
  const fromIndex=PRIMARY_PAGES.indexOf(from)
  const toIndex=PRIMARY_PAGES.indexOf(to)
  if(fromIndex===toIndex)return null
  return adjacentPage(from,fromIndex<toIndex?1:-1)
}
export function shouldCompleteSwipe(deltaX:number,elapsedMs:number):boolean {
  const distance=Math.abs(deltaX)
  return distance>=SWIPE_THRESHOLD_PX ||
    (distance>=SWIPE_FLICK_DISTANCE_PX && distance/Math.max(1,elapsedMs)>=SWIPE_FLICK_VELOCITY_PX_PER_MS)
}
export function isSwipeDirectionHorizontal(deltaX:number,deltaY:number):boolean {
  return Math.abs(deltaX)>11 && Math.abs(deltaX)>Math.abs(deltaY)*1.3
}
