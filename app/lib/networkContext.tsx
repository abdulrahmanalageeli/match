import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'

interface NetworkStatus {
  isOnline: boolean
  connectionType?: string
  effectiveType?: string
  downlink?: number
  rtt?: number
  saveData?: boolean
  lastOnlineTime?: Date
  connectionAttempts: number
  isConnecting: boolean
}

interface NetworkContextType {
  networkStatus: NetworkStatus
  testConnection: () => Promise<boolean>
  retryConnection: () => void
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined)

export const useNetwork = () => {
  const context = useContext(NetworkContext)
  if (!context) {
    throw new Error('useNetwork must be used within a NetworkProvider')
  }
  return context
}

interface NetworkProviderProps {
  children: ReactNode
}

export const NetworkProvider: React.FC<NetworkProviderProps> = ({ children }) => {
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>({
    isOnline: navigator.onLine,
    connectionAttempts: 0,
    isConnecting: false
  })

  // Enhanced network status detection
  const updateNetworkStatus = useCallback(() => {
    const newStatus: NetworkStatus = {
      isOnline: navigator.onLine,
      connectionAttempts: networkStatus.connectionAttempts,
      isConnecting: networkStatus.isConnecting
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

    setNetworkStatus(prev => ({
      ...prev,
      ...newStatus,
      lastOnlineTime: newStatus.isOnline ? new Date() : prev.lastOnlineTime
    }))
  }, [networkStatus.connectionAttempts, networkStatus.isConnecting])

  // Test connection by making a lightweight request
  const testConnection = useCallback(async (): Promise<boolean> => {
    setNetworkStatus(prev => ({ ...prev, isConnecting: true }))
    
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
        setNetworkStatus(prev => ({
          ...prev,
          isOnline: true,
          isConnecting: false,
          connectionAttempts: 0,
          lastOnlineTime: new Date()
        }))
        return true
      }
    } catch (error) {
      console.log('Connection test failed:', error)
    }
    
    setNetworkStatus(prev => ({
      ...prev,
      isOnline: false,
      isConnecting: false,
      connectionAttempts: prev.connectionAttempts + 1
    }))
    return false
  }, [])

  const retryConnection = useCallback(() => {
    testConnection()
  }, [testConnection])

  // Handle online/offline events
  useEffect(() => {
    const handleOnline = () => {
      console.log('🟢 Network: Online')
      updateNetworkStatus()
    }

    const handleOffline = () => {
      console.log('🔴 Network: Offline')
      updateNetworkStatus()
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

    // Periodic connection testing when offline
    const interval = setInterval(() => {
      if (!networkStatus.isOnline && !networkStatus.isConnecting) {
        testConnection()
      }
    }, 10000) // Test every 10 seconds when offline

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
  }, [updateNetworkStatus, testConnection, networkStatus.isOnline, networkStatus.isConnecting])

  const value: NetworkContextType = {
    networkStatus,
    testConnection,
    retryConnection
  }

  return (
    <NetworkContext.Provider value={value}>
      {children}
    </NetworkContext.Provider>
  )
} 