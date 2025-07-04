import React, { Suspense } from 'react'
import type { ComponentType } from 'react'
import { LoadingSpinner } from './LoadingSpinner'

interface LazyComponentProps {
  component: ComponentType<any>
  fallback?: React.ReactNode
  props?: Record<string, any>
}

export const LazyComponent: React.FC<LazyComponentProps> = ({ 
  component: Component, 
  fallback,
  props = {}
}) => {
  const defaultFallback = (
    <div className="min-h-screen flex items-center justify-center">
      <LoadingSpinner size="lg" text="Loading component..." />
    </div>
  )

  return (
    <Suspense fallback={fallback || defaultFallback}>
      <Component {...props} />
    </Suspense>
  )
}

// Pre-defined lazy components for common routes
export const LazyAdmin = React.lazy(() => import('../routes/admin'))
export const LazyWelcome = React.lazy(() => import('../routes/welcome'))
export const LazyMatrix = React.lazy(() => import('../routes/matrix'))
export const LazyMatchResult = React.lazy(() => import('../routes/MatchResult')) 