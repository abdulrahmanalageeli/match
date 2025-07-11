import React, { useState, useEffect, useCallback } from 'react'
import { Wifi, WifiOff, AlertTriangle, RefreshCw } from 'lucide-react'

interface NetworkStatus {
  isOnline: boolean
  connectionType?: string
  effectiveType?: string
  downlink?: number
  rtt?: number
  saveData?: boolean
}

export const OfflineIndicator: React.FC = () => {
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>({
    isOnline: navigator.onLine
  })
  const [showNotification, setShowNotification] = useState(false)
  const [lastOnlineTime, setLastOnlineTime] = useState<Date | null>(null)
  const [connectionAttempts, setConnectionAttempts] = useState(0)

  // Enhanced network status detection
  const updateNetworkStatus = useCallback(() => {
    const newStatus: NetworkStatus = {
      isOnline: navigator.onLine
    }

    // Get connection information if available
    if ('connection' in navigator) {
      const connection = (navigator as any).connection
      if (connection) {
        newStatus.connectionType = connection.effectiveType || connection.type
        newStatus.downlink = connection.downlink
        newStatus.rtt = connection.rtt
        newStatus.saveData = connection.saveData
      }
    }

    setNetworkStatus(newStatus)

    // Update last online time
    if (newStatus.isOnline) {
      setLastOnlineTime(new Date())
      setConnectionAttempts(0)
    } else {
      setConnectionAttempts(prev => prev + 1)
    }
  }, [])

  // Test connection by making a lightweight request
  const testConnection = useCallback(async () => {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout

      const response = await fetch('/api/db-check', {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-cache'
      })

      clearTimeout(timeoutId)
      
      if (response.ok) {
        setNetworkStatus(prev => ({ ...prev, isOnline: true }))
        setLastOnlineTime(new Date())
        setConnectionAttempts(0)
        return true
      }
    } catch (error) {
      console.log('Connection test failed:', error)
    }
    
    setNetworkStatus(prev => ({ ...prev, isOnline: false }))
    return false
  }, [])

  // Handle online/offline events
  useEffect(() => {
    const handleOnline = () => {
      console.log('🟢 Network: Online')
      updateNetworkStatus()
      setShowNotification(true)
      setTimeout(() => setShowNotification(false), 3000)
    }

    const handleOffline = () => {
      console.log('🔴 Network: Offline')
      updateNetworkStatus()
      setShowNotification(true)
    }

    // Listen for network changes
    const handleNetworkChange = () => {
      console.log('🔄 Network: Status changed')
      updateNetworkStatus()
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    
    if ('connection' in navigator) {
      const connection = (navigator as any).connection
      if (connection) {
        connection.addEventListener('change', handleNetworkChange)
      }
    }

    // Initial status check
    updateNetworkStatus()

    // Periodic connection testing – always ping, but cheaper when online
    const interval = setInterval(() => {
      // If we think we're online, just do a quick lightweight HEAD request.
      // If offline (or the HEAD fails), testConnection will flip the state accordingly.
      testConnection()
    }, 15000) // ping every 15 s

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      
      if ('connection' in navigator) {
        const connection = (navigator as any).connection
        if (connection) {
          connection.removeEventListener('change', handleNetworkChange)
        }
      }
      
      clearInterval(interval)
    }
  }, [updateNetworkStatus, testConnection, networkStatus.isOnline])

  // Don't show anything if online and no notification
  if (networkStatus.isOnline && !showNotification) {
    return null
  }

  // Online notification (brief)
  if (networkStatus.isOnline && showNotification) {
    return (
      <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[9999] animate-in slide-in-from-top-4 duration-500">
        <div className="bg-green-500/95 backdrop-blur-sm border border-green-400 rounded-xl px-4 py-3 flex items-center gap-3 text-white shadow-2xl">
          <Wifi className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm font-medium">تم استعادة الاتصال بالإنترنت</span>
        </div>
      </div>
    )
  }

  // Offline notification
  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[9999] animate-in slide-in-from-top-4 duration-500">
      <div className="bg-red-500/95 backdrop-blur-sm border border-red-400 rounded-xl px-6 py-4 flex items-center gap-4 text-white shadow-2xl max-w-md">
        <div className="flex-shrink-0">
          <WifiOff className="w-6 h-6 animate-pulse" />
        </div>
        
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4" />
            <span className="font-semibold text-sm">لا يوجد اتصال بالإنترنت</span>
          </div>
          
          <div className="text-xs opacity-90 space-y-1">
            <p>يرجى التحقق من اتصالك بالإنترنت</p>
            
            {networkStatus.connectionType && (
              <p className="opacity-75">
                نوع الاتصال: {networkStatus.connectionType}
                {networkStatus.downlink && ` • السرعة: ${networkStatus.downlink} Mbps`}
              </p>
            )}
            
            {lastOnlineTime && (
              <p className="opacity-75">
                آخر اتصال: {lastOnlineTime.toLocaleTimeString('ar-SA')}
              </p>
            )}
            
            {connectionAttempts > 0 && (
              <p className="opacity-75">
                محاولات إعادة الاتصال: {connectionAttempts}
              </p>
            )}
          </div>
        </div>
        
        <button
          onClick={testConnection}
          className="flex-shrink-0 p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors duration-200"
          title="إعادة اختبار الاتصال"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
} 