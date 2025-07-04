import React from 'react'
import { Button } from '../../components/ui/button'
import { LoadingSpinner } from './LoadingSpinner'
import type { ComponentProps } from 'react'

interface OptimizedButtonProps extends Omit<ComponentProps<'button'>, 'children'> {
  children: React.ReactNode
  loading?: boolean
  loadingText?: string
  icon?: React.ReactNode
  iconPosition?: 'left' | 'right'
}

export const OptimizedButton = React.memo<OptimizedButtonProps>(({
  children,
  loading = false,
  loadingText,
  icon,
  iconPosition = 'left',
  disabled,
  className = '',
  ...props
}) => {
  const isDisabled = disabled || loading

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center space-x-2">
          <LoadingSpinner size="sm" />
          <span>{loadingText || children}</span>
        </div>
      )
    }

    if (icon) {
      return (
        <div className="flex items-center space-x-2">
          {iconPosition === 'left' && icon}
          <span>{children}</span>
          {iconPosition === 'right' && icon}
        </div>
      )
    }

    return children
  }

  return (
    <Button
      disabled={isDisabled}
      className={`transition-all duration-200 ${className}`}
      {...props}
    >
      {renderContent()}
    </Button>
  )
})

OptimizedButton.displayName = 'OptimizedButton' 