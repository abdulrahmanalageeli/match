import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Security utilities
export function sanitizeInput(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export function validateToken(token: string): boolean {
  // UUID v4 format validation
  const tokenRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return tokenRegex.test(token)
}

export function validateNumber(value: any): boolean {
  return typeof value === 'number' && !isNaN(value) && isFinite(value)
}

// Rate limiting utilities
export class RateLimiter {
  private requests = new Map<string, number[]>()
  private readonly windowMs: number
  private readonly maxRequests: number

  constructor(windowMs: number = 60000, maxRequests: number = 10) {
    this.windowMs = windowMs
    this.maxRequests = maxRequests
  }

  isAllowed(identifier: string): boolean {
    const now = Date.now()
    const windowStart = now - this.windowMs
    
    if (!this.requests.has(identifier)) {
      this.requests.set(identifier, [now])
      return true
    }

    const requests = this.requests.get(identifier)!
    const recentRequests = requests.filter(time => time > windowStart)
    
    if (recentRequests.length >= this.maxRequests) {
      return false
    }

    recentRequests.push(now)
    this.requests.set(identifier, recentRequests)
    return true
  }

  cleanup() {
    const now = Date.now()
    const windowStart = now - this.windowMs
    
    for (const [identifier, requests] of this.requests.entries()) {
      const recentRequests = requests.filter(time => time > windowStart)
      if (recentRequests.length === 0) {
        this.requests.delete(identifier)
      } else {
        this.requests.set(identifier, recentRequests)
      }
    }
  }
}
