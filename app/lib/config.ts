// Environment configuration
export const config = {
  // API Configuration
  api: {
    baseUrl: process.env.NODE_ENV === 'production' 
      ? 'https://your-domain.com' 
      : 'http://localhost:3000',
    timeout: 10000,
    retries: 3,
  },

  // Supabase Configuration
  supabase: {
    url: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    anonKey: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY,
  },

  // OpenAI Configuration
  openai: {
    apiKey: process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY,
    model: 'gpt-3.5-turbo',
    maxTokens: 150,
    temperature: 0.7,
  },

  // Application Configuration
  app: {
    name: 'التوافق الأعمى',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    debug: process.env.NODE_ENV === 'development',
  },

  // Feature Flags
  features: {
    aiMatching: true,
    conversationStarters: true,
    surveyValidation: true,
    adminPanel: true,
    emergencyPause: true,
  },

  // Rate Limiting
  rateLimit: {
    windowMs: 60000, // 1 minute
    maxRequests: 10,
  },

  // Security
  security: {
    tokenExpiry: 24 * 60 * 60 * 1000, // 24 hours
    maxParticipants: 100,
    adminPassword: process.env.ADMIN_PASSWORD || 'soulmatch2025',
  },

  // UI Configuration
  ui: {
    theme: {
      primary: '#0ea5e9',
      secondary: '#8b5cf6',
      accent: '#f59e0b',
    },
    animations: {
      duration: 300,
      easing: 'ease-out',
    },
  },
} as const

// Type-safe config access
export type Config = typeof config

// Environment validation
export function validateConfig() {
  const requiredEnvVars = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'OPENAI_API_KEY',
  ]

  const missing = requiredEnvVars.filter(
    varName => !process.env[varName] && !process.env[`VITE_${varName}`]
  )

  if (missing.length > 0) {
    console.warn('Missing environment variables:', missing)
  }

  return missing.length === 0
}

// Development helpers
export const isDevelopment = config.app.environment === 'development'
export const isProduction = config.app.environment === 'production'
export const isTest = config.app.environment === 'test' 