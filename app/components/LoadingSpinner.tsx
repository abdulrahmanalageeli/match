import React from 'react'
import { Loader2 } from 'lucide-react'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  text?: string
  className?: string
  variant?: 'default' | 'pulse' | 'dots' | 'bars'
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = React.memo(({ 
  size = 'md', 
  text = 'Loading...',
  className = '',
  variant = 'default'
}) => {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8', 
    lg: 'h-12 w-12',
    xl: 'h-16 w-16'
  }

  const renderSpinner = () => {
    switch (variant) {
      case 'pulse':
        return (
          <div className={`${sizeClasses[size]} bg-gradient-to-r from-blue-500 to-purple-600 rounded-full animate-pulse`} />
        )
      case 'dots':
        return (
          <div className="flex space-x-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`${size === 'sm' ? 'w-1 h-1' : size === 'md' ? 'w-2 h-2' : 'w-3 h-3'} bg-current rounded-full animate-bounce`}
                style={{ animationDelay: `${i * 0.1}s` }}
              />
            ))}
          </div>
        )
      case 'bars':
        return (
          <div className="flex space-x-1">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`${size === 'sm' ? 'w-1' : size === 'md' ? 'w-1.5' : 'w-2'} bg-current rounded-full animate-pulse`}
                style={{ 
                  height: size === 'sm' ? '12px' : size === 'md' ? '16px' : '20px',
                  animationDelay: `${i * 0.1}s` 
                }}
              />
            ))}
          </div>
        )
      default:
        return <Loader2 className={`animate-spin text-primary ${sizeClasses[size]}`} />
    }
  }

  return (
    <div className={`flex flex-col items-center justify-center space-y-2 ${className}`} role="status" aria-label="Loading">
      {renderSpinner()}
      {text && (
        <p className="text-sm text-muted-foreground animate-pulse" aria-live="polite">
          {text}
        </p>
      )}
    </div>
  )
})

LoadingSpinner.displayName = 'LoadingSpinner' 