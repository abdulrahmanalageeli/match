import { useEffect, useRef, useCallback } from "react"

/**
 * Visibility-aware polling hook.
 * - Pauses when document is hidden
 * - Resumes immediately (fetches right away) when tab becomes visible
 * - Cleans up on unmount
 */
export function useVisibilityPoll(
  callback: () => void | Promise<void>,
  intervalMs: number,
  enabled: boolean = true
) {
  const savedCallback = useRef(callback)
  savedCallback.current = callback

  const tick = useCallback(async () => {
    if (document.hidden) return
    await savedCallback.current()
  }, [])

  useEffect(() => {
    if (!enabled) return

    // Initial fetch
    tick()

    const iv = setInterval(tick, intervalMs)

    const onVisibility = () => {
      if (!document.hidden) {
        // Immediate fetch on return
        tick()
      }
    }
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      clearInterval(iv)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [enabled, intervalMs, tick])
}
