import React, { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { AlertCircle, RefreshCw, Home, Bug, Shield } from 'lucide-react'
import { Button } from '../../components/ui/button'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  showDetails?: boolean
}

interface State {
  hasError: boolean
  error?: Error
  errorInfo?: ErrorInfo
  errorId?: string
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { 
      hasError: true, 
      error,
      errorId: Math.random().toString(36).substr(2, 9)
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    
    // Report error to monitoring service in production
    if (process.env.NODE_ENV === 'production') {
      this.reportError(error, errorInfo)
    }
    
    this.setState({ error, errorInfo })
    this.props.onError?.(error, errorInfo)
  }

  private reportError = (error: Error, errorInfo: ErrorInfo) => {
    // In production, you would send this to your error monitoring service
    // Example: Sentry, LogRocket, etc.
    try {
      const errorReport = {
        error: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        errorId: this.state.errorId,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href,
      }
      
      // Send to your error reporting service
      console.error('Error Report:', errorReport)
    } catch (reportError) {
      console.error('Failed to report error:', reportError)
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined, errorId: undefined })
  }

  handleGoHome = () => {
    window.location.href = '/'
  }

  handleReportBug = () => {
    const errorDetails = `
Error ID: ${this.state.errorId}
Error: ${this.state.error?.message}
Stack: ${this.state.error?.stack}
Component Stack: ${this.state.errorInfo?.componentStack}
URL: ${window.location.href}
User Agent: ${navigator.userAgent}
    `.trim()

    // Copy to clipboard
    navigator.clipboard.writeText(errorDetails).then(() => {
      alert('Error details copied to clipboard. Please report this to support.')
    }).catch(() => {
      // Fallback for older browsers
      const textArea = document.createElement('textarea')
      textArea.value = errorDetails
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      alert('Error details copied to clipboard. Please report this to support.')
    })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
          <div className="bg-white/10 backdrop-blur-xl border border-white/20 text-white p-8 rounded-2xl shadow-2xl w-full max-w-md space-y-6">
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="relative">
                  <AlertCircle className="w-16 h-16 text-red-400" />
                  <div className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center">
                    <Shield className="w-3 h-3 text-white" />
                  </div>
                </div>
              </div>
              <h1 className="text-2xl font-bold text-red-200">
                عذراً! حدث خطأ غير متوقع
              </h1>
              <p className="text-slate-300 text-sm">
                حدث خطأ في التطبيق. يرجى المحاولة مرة أخرى أو الاتصال بالدعم إذا استمرت المشكلة.
              </p>
              {this.state.errorId && (
                <p className="text-xs text-slate-400">
                  معرف الخطأ: {this.state.errorId}
                </p>
              )}
            </div>

            <div className="space-y-3">
              <Button
                onClick={this.handleRetry}
                className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white py-3 rounded-xl font-medium transition-all duration-300"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                حاول مرة أخرى
              </Button>
              
              <Button
                onClick={this.handleGoHome}
                variant="outline"
                className="w-full border-white/20 text-white hover:bg-white/10 py-3 rounded-xl font-medium transition-all duration-300"
              >
                <Home className="w-4 h-4 mr-2" />
                العودة للصفحة الرئيسية
              </Button>

              <Button
                onClick={this.handleReportBug}
                variant="outline"
                className="w-full border-yellow-400/20 text-yellow-400 hover:bg-yellow-400/10 py-3 rounded-xl font-medium transition-all duration-300"
              >
                <Bug className="w-4 h-4 mr-2" />
                الإبلاغ عن المشكلة
              </Button>
            </div>

            {this.props.showDetails && this.state.error && (
              <details className="mt-4 p-4 bg-black/20 rounded-lg">
                <summary className="cursor-pointer text-sm text-slate-300 mb-2">
                  تفاصيل الخطأ (للمطورين)
                </summary>
                <pre className="text-xs text-red-300 overflow-auto max-h-40">
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
} 