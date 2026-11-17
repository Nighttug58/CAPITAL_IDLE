/** Pure sprite timing for the 8x6 banknote sheet (48 frames). */
export const BANKNOTE_FRAME_COUNT = 48
export const BANKNOTE_FPS = 12
export const BANKNOTE_CYCLE_MS = BANKNOTE_FRAME_COUNT * 1000 / BANKNOTE_FPS

/** Advance by elapsed monotonic time, never by rendered frames or clicks. */
export function banknoteFrameAtElapsedMs(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0
  return Math.floor(elapsedMs * BANKNOTE_FPS / 1000) % BANKNOTE_FRAME_COUNT
}
