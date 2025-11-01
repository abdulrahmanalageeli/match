/**
 * Formatting utility functions
 */

/**
 * Format time from seconds to MM:SS
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

/**
 * Format time from seconds to HH:MM:SS
 */
export function formatTimeLong(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

/**
 * Format date to Arabic format
 */
export function formatDateArabic(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('ar-SA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  })
}

/**
 * Format time to Arabic format
 */
export function formatTimeArabic(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleTimeString('ar-SA', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  })
}

/**
 * Format phone number for display (Saudi format)
 */
export function formatPhoneNumber(phone: string): string {
  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, '')
  
  // Format as 05XX XXX XXXX
  if (cleaned.length === 10 && cleaned.startsWith('05')) {
    return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7)}`
  }
  
  return phone
}

/**
 * Format percentage with locale
 */
export function formatPercentage(value: number, decimals: number = 0): string {
  return `${value.toFixed(decimals)}%`
}

/**
 * Format compatibility score with color coding
 */
export function getScoreColor(score: number): string {
  if (score >= 70) return 'text-green-500'
  if (score >= 50) return 'text-yellow-500'
  if (score >= 30) return 'text-orange-500'
  return 'text-red-500'
}

/**
 * Format compatibility score with emoji
 */
export function getScoreEmoji(score: number): string {
  if (score >= 80) return '🔥'
  if (score >= 70) return '😍'
  if (score >= 60) return '😊'
  if (score >= 50) return '🙂'
  if (score >= 40) return '😐'
  if (score >= 30) return '🤔'
  return '😕'
}

/**
 * Format match type to Arabic
 */
export function formatMatchType(type: string): string {
  const types: Record<string, string> = {
    'soulmate': 'توأم روح',
    'neutral': 'محايد',
    'enemy': 'عدو لدود',
    'compatible': 'متوافق',
    'incompatible': 'غير متوافق'
  }
  return types[type] || type
}

/**
 * Truncate text with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

/**
 * Format participant number with # prefix
 */
export function formatParticipantNumber(num: number | null): string {
  if (num === null) return '؟'
  if (num === 9999) return 'المنظم'
  return `#${num}`
}

/**
 * Format round number to Arabic
 */
export function formatRoundNumber(round: number): string {
  const rounds: Record<number, string> = {
    1: 'الجولة الأولى',
    2: 'الجولة الثانية',
    3: 'الجولة الثالثة',
    4: 'الجولة الرابعة'
  }
  return rounds[round] || `الجولة ${round}`
}

/**
 * Format table number to Arabic
 */
export function formatTableNumber(table: number | null): string {
  if (table === null) return 'غير محدد'
  return `طاولة ${table}`
}

/**
 * Get relative time in Arabic
 */
export function getRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return 'الآن'
  if (minutes < 60) return `منذ ${minutes} دقيقة`
  if (hours < 24) return `منذ ${hours} ساعة`
  if (days < 7) return `منذ ${days} يوم`
  
  return formatDateArabic(d)
}

/**
 * Calculate and format time elapsed
 */
export function formatElapsedTime(startTime: Date | string): string {
  const start = typeof startTime === 'string' ? new Date(startTime) : startTime
  const elapsed = Math.floor((Date.now() - start.getTime()) / 1000)
  return formatTime(elapsed)
}

/**
 * Calculate and format time remaining
 */
export function formatRemainingTime(endTime: Date | string): string {
  const end = typeof endTime === 'string' ? new Date(endTime) : endTime
  const remaining = Math.max(0, Math.floor((end.getTime() - Date.now()) / 1000))
  return formatTime(remaining)
}
