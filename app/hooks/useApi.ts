import { useState, useCallback, useRef } from 'react'
import { apiClient } from '../lib/api'
import type { ApiResponse } from '../lib/types'

interface UseApiState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

interface UseApiReturn<T> extends UseApiState<T> {
  execute: (...args: any[]) => Promise<void>
  reset: () => void
}

export function useApi<T = any>(
  apiFunction: (...args: any[]) => Promise<ApiResponse<T>>,
  initialData: T | null = null
): UseApiReturn<T> {
  const [state, setState] = useState<UseApiState<T>>({
    data: initialData,
    loading: false,
    error: null,
  })

  const abortControllerRef = useRef<AbortController | null>(null)

  const execute = useCallback(
    async (...args: any[]) => {
      // Cancel previous request if it's still running
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }

      // Create new abort controller
      abortControllerRef.current = new AbortController()

      setState(prev => ({ ...prev, loading: true, error: null }))

      try {
        const response = await apiFunction(...args)

        if (response.success && response.data) {
          setState({
            data: response.data,
            loading: false,
            error: null,
          })
        } else {
          setState({
            data: null,
            loading: false,
            error: response.error || 'An error occurred',
          })
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          // Request was cancelled, don't update state
          return
        }

        setState({
          data: null,
          loading: false,
          error: error instanceof Error ? error.message : 'An unexpected error occurred',
        })
      }
    },
    [apiFunction]
  )

  const reset = useCallback(() => {
    setState({
      data: initialData,
      loading: false,
      error: null,
    })
  }, [initialData])

  return {
    ...state,
    execute,
    reset,
  }
}

// Specific API hooks for common operations
export function useTokenCreation() {
  return useApi(apiClient.createToken.bind(apiClient))
}

export function useTokenResolution() {
  return useApi(apiClient.resolveToken.bind(apiClient))
}

export function useParticipantSave() {
  return useApi(apiClient.saveParticipant.bind(apiClient))
}

export function useSummaryGeneration() {
  return useApi(apiClient.generateSummary.bind(apiClient))
}

export function useMatchesFetch() {
  return useApi(apiClient.getMyMatches.bind(apiClient))
}

export function useParticipantsFetch() {
  return useApi(apiClient.getParticipants.bind(apiClient))
}

export function useEventStateFetch() {
  return useApi(apiClient.getEventState.bind(apiClient))
}

export function usePhaseUpdate() {
  return useApi(apiClient.setPhase.bind(apiClient))
}

export function useMatchingTrigger() {
  return useApi(apiClient.triggerMatching.bind(apiClient))
} 