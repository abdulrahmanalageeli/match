import React, { useState, useEffect, useCallback } from 'react'
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react'
import { createPortal } from 'react-dom'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

interface ToastProps {
  id: string
  type: ToastType
  title: string
  message?: string
  duration?: number
  onClose: (id: string) => void
}

const Toast: React.FC<ToastProps> = ({ id, type, title, message, duration = 5000, onClose }) => {
  const [isVisible, setIsVisible] = useState(false)
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    setIsVisible(true)
    const timer = setTimeout(() => {
      handleClose()
    }, duration)

    return () => clearTimeout(timer)
  }, [duration])

  const handleClose = useCallback(() => {
    setIsExiting(true)
    setTimeout(() => {
      onClose(id)
    }, 300)
  }, [id, onClose])

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />
      case 'info':
        return <Info className="w-5 h-5 text-blue-500" />
    }
  }

  const getStyles = () => {
    const baseStyles = "transform transition-all duration-300 ease-out"
    const visibilityStyles = isVisible ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"
    const exitStyles = isExiting ? "translate-x-full opacity-0 scale-95" : ""
    
    return `${baseStyles} ${visibilityStyles} ${exitStyles}`
  }

  return (
    <div className={`bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg p-4 min-w-80 max-w-md ${getStyles()}`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {getIcon()}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {title}
          </h4>
          {message && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {message}
            </p>
          )}
        </div>
        <button
          onClick={handleClose}
          className="flex-shrink-0 ml-3 p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

interface ToastContextType {
  showToast: (toast: Omit<ToastProps, 'id' | 'onClose'>) => void
  hideToast: (id: string) => void
}

const ToastContext = React.createContext<ToastContextType | null>(null)

export const useToast = () => {
  const context = React.useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

interface ToastProviderProps {
  children: React.ReactNode
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [toasts, setToasts] = useState<Array<ToastProps & { id: string }>>([])

  const showToast = useCallback((toast: Omit<ToastProps, 'id' | 'onClose'>) => {
    const id = Math.random().toString(36).substr(2, 9)
    setToasts(prev => [...prev, { ...toast, id, onClose: hideToast }])
  }, [])

  const hideToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ showToast, hideToast }}>
      {children}
      {typeof window !== 'undefined' && createPortal(
        <div className="fixed top-4 right-4 z-50 space-y-2">
          {toasts.map(toast => (
            <Toast key={toast.id} {...toast} />
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  )
} 