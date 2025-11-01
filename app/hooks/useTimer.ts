import { useState, useEffect, useCallback, useRef } from 'react'
import { saveToLocalStorage, removeFromLocalStorage } from './useLocalStorage'

interface UseTimerOptions {
  duration: number
  onComplete?: () => void
  autoStart?: boolean
  persist?: boolean
  persistKey?: string
}

interface UseTimerReturn {
  timeRemaining: number
  isActive: boolean
  isPaused: boolean
  start: () => void
  pause: () => void
  resume: () => void
  reset: () => void
  stop: () => void
  setTime: (time: number) => void
}

/**
 * Custom hook for managing timers with pause/resume and localStorage persistence
 */
export function useTimer({
  duration,
  onComplete,
  autoStart = false,
  persist = false,
  persistKey = 'timer'
}: UseTimerOptions): UseTimerReturn {
  const [timeRemaining, setTimeRemaining] = useState(duration)
  const [isActive, setIsActive] = useState(autoStart)
  const [isPaused, setIsPaused] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const startTimeRef = useRef<number | null>(null)

  // Clear interval helper
  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  // Start timer
  const start = useCallback(() => {
    setIsActive(true)
    setIsPaused(false)
    startTimeRef.current = Date.now()
    
    if (persist && persistKey) {
      saveToLocalStorage(`${persistKey}_start`, startTimeRef.current)
      saveToLocalStorage(`${persistKey}_duration`, duration)
    }
  }, [duration, persist, persistKey])

  // Pause timer
  const pause = useCallback(() => {
    setIsPaused(true)
    clearTimer()
  }, [clearTimer])

  // Resume timer
  const resume = useCallback(() => {
    setIsPaused(false)
    setIsActive(true)
  }, [])

  // Reset timer
  const reset = useCallback(() => {
    clearTimer()
    setTimeRemaining(duration)
    setIsActive(false)
    setIsPaused(false)
    startTimeRef.current = null
    
    if (persist && persistKey) {
      removeFromLocalStorage(`${persistKey}_start`)
      removeFromLocalStorage(`${persistKey}_duration`)
    }
  }, [duration, clearTimer, persist, persistKey])

  // Stop timer
  const stop = useCallback(() => {
    clearTimer()
    setIsActive(false)
    setIsPaused(false)
    
    if (persist && persistKey) {
      removeFromLocalStorage(`${persistKey}_start`)
      removeFromLocalStorage(`${persistKey}_duration`)
    }
  }, [clearTimer, persist, persistKey])

  // Set time manually
  const setTime = useCallback((time: number) => {
    setTimeRemaining(time)
  }, [])

  // Main timer effect
  useEffect(() => {
    if (isActive && !isPaused) {
      intervalRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          const newTime = Math.max(0, prev - 1)
          
          // Call onComplete when timer reaches 0
          if (newTime === 0 && onComplete) {
            onComplete()
            clearTimer()
            setIsActive(false)
          }
          
          return newTime
        })
      }, 1000)
    }

    return () => clearTimer()
  }, [isActive, isPaused, onComplete, clearTimer])

  return {
    timeRemaining,
    isActive,
    isPaused,
    start,
    pause,
    resume,
    reset,
    stop,
    setTime
  }
}

/**
 * Format seconds into MM:SS format
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

/**
 * Format seconds into HH:MM:SS format
 */
export function formatTimeLong(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

/**
 * Calculate time elapsed since a start time
 */
export function calculateElapsed(startTime: string | Date): number {
  const start = typeof startTime === 'string' ? new Date(startTime) : startTime
  return Math.floor((Date.now() - start.getTime()) / 1000)
}

/**
 * Calculate time remaining until an end time
 */
export function calculateRemaining(endTime: string | Date): number {
  const end = typeof endTime === 'string' ? new Date(endTime) : endTime
  return Math.max(0, Math.floor((end.getTime() - Date.now()) / 1000))
}
