import { useState, useEffect } from 'react'

/**
 * Custom hook for managing localStorage with React state
 */
export function useLocalStorage<T>(key: string, initialValue: T) {
  // Get initial value from localStorage or use provided initialValue
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key)
      return item ? JSON.parse(item) : initialValue
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error)
      return initialValue
    }
  })

  // Update localStorage when state changes
  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(storedValue))
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error)
    }
  }, [key, storedValue])

  return [storedValue, setStoredValue] as const
}

/**
 * Save a value to localStorage
 */
export function saveToLocalStorage(key: string, value: any): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    console.error(`Error saving to localStorage key "${key}":`, error)
  }
}

/**
 * Get a value from localStorage
 */
export function getFromLocalStorage<T>(key: string, defaultValue: T): T {
  try {
    const item = window.localStorage.getItem(key)
    return item ? JSON.parse(item) : defaultValue
  } catch (error) {
    console.error(`Error reading from localStorage key "${key}":`, error)
    return defaultValue
  }
}

/**
 * Remove a value from localStorage
 */
export function removeFromLocalStorage(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch (error) {
    console.error(`Error removing from localStorage key "${key}":`, error)
  }
}

/**
 * Clear all values from localStorage
 */
export function clearLocalStorage(): void {
  try {
    window.localStorage.clear()
  } catch (error) {
    console.error('Error clearing localStorage:', error)
  }
}
