import { catchUpCapital, MAX_CATCH_UP_SECONDS } from './clock.ts'
import { DIVIDEND_SECOND_MS } from './dividends.ts'
import type { CapitalState } from '../capital.ts'

// Une seule minuterie récursive ; aucune boucle synchrone non bornée.
// Les 256 secondes par tranche évitent de monopoliser le thread principal.
const SAVE_INTERVAL_MS = 5_000
const REPLAY_PAUSE_MS = 16

export interface MarketRuntimeOptions {
  getState: () => CapitalState
  setState: (state: CapitalState) => void
  persist: () => void
  now?: () => number
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>
  cancel?: (handle: ReturnType<typeof setTimeout>) => void
}

export function createMarketRuntime(options: MarketRuntimeOptions) {
  const now = options.now ?? Date.now
  const schedule = options.schedule ?? ((callback, ms) => setTimeout(callback, ms))
  const cancel = options.cancel ?? clearTimeout
  let started = false
  let paused = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastPersistedAt = 0
  let dirty = false
  let processing = false

  function clearTimer(): void {
    if (timer !== null) {
      cancel(timer)
      timer = null
    }
  }

  function saveIfDirty(force = false): void {
    if (!dirty) return
    const timestamp = now()
    if (!force && timestamp - lastPersistedAt < SAVE_INTERVAL_MS) return
    options.persist()
    lastPersistedAt = timestamp
    dirty = false
  }

  function process(): void {
    if (!started || paused || processing) return
    clearTimer()
    processing = true

    try {
      const timestamp = now()
      const result = catchUpCapital(options.getState(), timestamp, MAX_CATCH_UP_SECONDS)
      if (result.processedSeconds > 0) {
        options.setState(result.state)
        dirty = true
      }
      saveIfDirty(result.pendingSeconds === 0)
      if (!started || paused) return

      const nextDelay = result.pendingSeconds > 0
        ? REPLAY_PAUSE_MS
        : Math.max(50, Math.min(DIVIDEND_SECOND_MS, result.state.trading.dividendLastPaidAt + DIVIDEND_SECOND_MS - timestamp))
      timer = schedule(process, nextDelay)
    } finally {
      processing = false
    }
  }

  function start(): void {
    if (started) return
    started = true
    paused = false
    process()
  }

  function pause(): void {
    if (!started || paused) return
    paused = true
    clearTimer()
    saveIfDirty(true)
  }

  function resume(): void {
    if (!started || !paused) return
    paused = false
    process()
  }

  function wake(): void {
    if (!started || paused) return
    process()
  }

  function stop(): void {
    if (!started) return
    started = false
    paused = false
    clearTimer()
    saveIfDirty(true)
  }

  return { start, pause, resume, wake, stop }
}
