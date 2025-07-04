import type { 
  Participant, 
  MatchResult, 
  EventState, 
  ApiResponse,
  TokenRequest,
  SaveParticipantRequest,
  GenerateSummaryRequest,
  GetMatchesRequest
} from './types'

// Cache implementation
class ApiCache {
  private cache = new Map<string, { data: any; timestamp: number }>()
  private readonly TTL = 5 * 60 * 1000 // 5 minutes

  set(key: string, data: any): void {
    this.cache.set(key, { data, timestamp: Date.now() })
  }

  get(key: string): any | null {
    const item = this.cache.get(key)
    if (!item) return null
    
    if (Date.now() - item.timestamp > this.TTL) {
      this.cache.delete(key)
      return null
    }
    
    return item.data
  }

  clear(): void {
    this.cache.clear()
  }
}

const cache = new ApiCache()

// API client with error handling and caching
class ApiClient {
  private async request<T>(
    endpoint: string, 
    options: RequestInit = {},
    useCache = false,
    cacheKey?: string
  ): Promise<ApiResponse<T>> {
    try {
      // Check cache first
      if (useCache && cacheKey) {
        const cached = cache.get(cacheKey)
        if (cached) return cached
      }

      const response = await fetch(endpoint, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}: ${response.statusText}`)
      }

      const result = { success: true, data, ...data }

      // Cache successful responses
      if (useCache && cacheKey) {
        cache.set(cacheKey, result)
      }

      return result
    } catch (error) {
      console.error(`API Error (${endpoint}):`, error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      }
    }
  }

  // Token operations
  async createToken(assignedNumber: number): Promise<ApiResponse<{ secure_token: string }>> {
    return this.request('/api/token-handler', {
      method: 'POST',
      body: JSON.stringify({
        action: 'create',
        assigned_number: assignedNumber,
      }),
    })
  }

  async resolveToken(secureToken: string): Promise<ApiResponse<{
    success: boolean
    assigned_number: number
    q1?: string
    q2?: string
    q3?: string
    q4?: string
    summary?: string
  }>> {
    return this.request('/api/token-handler', {
      method: 'POST',
      body: JSON.stringify({
        action: 'resolve',
        secure_token: secureToken,
      }),
    })
  }

  // Participant operations
  async saveParticipant(data: SaveParticipantRequest): Promise<ApiResponse<{ message: string }>> {
    return this.request('/api/save-participant', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async generateSummary(responses: Record<string, string>): Promise<ApiResponse<{ summary: string }>> {
    return this.request('/api/generate-summary', {
      method: 'POST',
      body: JSON.stringify({ responses }),
    })
  }

  // Match operations
  async getMyMatches(data: GetMatchesRequest): Promise<ApiResponse<{ matches: MatchResult[] }>> {
    const cacheKey = `matches_${data.assigned_number}_${data.round || 1}`
    return this.request('/api/get-my-matches', {
      method: 'POST',
      body: JSON.stringify(data),
    }, true, cacheKey)
  }

  // Admin operations
  async getParticipants(): Promise<ApiResponse<{ participants: Participant[] }>> {
    return this.request('/api/admin', {
      method: 'POST',
      body: JSON.stringify({ action: 'participants' }),
    }, true, 'participants')
  }

  async getEventState(): Promise<ApiResponse<EventState>> {
    return this.request('/api/admin', {
      method: 'POST',
      body: JSON.stringify({ action: 'get-event-state' }),
    }, true, 'event-state')
  }

  async setPhase(phase: string): Promise<ApiResponse<{ message: string }>> {
    // Clear cache when phase changes
    cache.clear()
    
    return this.request('/api/admin', {
      method: 'POST',
      body: JSON.stringify({
        action: 'set-phase',
        match_id: '00000000-0000-0000-0000-000000000000',
        phase,
      }),
    })
  }

  async triggerMatching(): Promise<ApiResponse<{ analysis: string }>> {
    return this.request('/api/admin/trigger-match', {
      method: 'POST',
    })
  }

  // Utility methods
  clearCache(): void {
    cache.clear()
  }
}

export const apiClient = new ApiClient() 