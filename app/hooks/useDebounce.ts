import { useState, useEffect } from 'react'

/**
 * Custom hook for debouncing values
 * Useful for search inputs and expensive operations
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    // Set up timeout to update debounced value
    const timeoutId = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    // Cleanup timeout if value changes before delay completes
    return () => {
      clearTimeout(timeoutId)
    }
  }, [value, delay])

  return debouncedValue
}

/**
 * Custom hook for debouncing callbacks
 * Useful for event handlers like onScroll, onResize
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number = 300
): (...args: Parameters<T>) => void {
  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null)

  return (...args: Parameters<T>) => {
    // Clear existing timeout
    if (timeoutId) {
      clearTimeout(timeoutId)
    }

    // Set new timeout
    const newTimeoutId = setTimeout(() => {
      callback(...args)
    }, delay)

    setTimeoutId(newTimeoutId)
  }
}

/**
 * Custom hook for throttling callbacks
 * Useful for limiting rate of function calls
 */
export function useThrottle<T>(value: T, interval: number = 300): T {
  const [throttledValue, setThrottledValue] = useState<T>(value)
  const [lastUpdated, setLastUpdated] = useState<number>(Date.now())

  useEffect(() => {
    const timeSinceLastUpdate = Date.now() - lastUpdated

    if (timeSinceLastUpdate >= interval) {
      setThrottledValue(value)
      setLastUpdated(Date.now())
    } else {
      const timeoutId = setTimeout(() => {
        setThrottledValue(value)
        setLastUpdated(Date.now())
      }, interval - timeSinceLastUpdate)

      return () => clearTimeout(timeoutId)
    }
  }, [value, interval, lastUpdated])

  return throttledValue
}
