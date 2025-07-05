export default async function handler(req, res) {
  // Test environment variables
  const envVars = {
    SUPABASE_URL: process.env.SUPABASE_URL ? "SET" : "NOT SET",
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ? "SET" : "NOT SET",
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ? "SET" : "NOT SET",
    VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY ? "SET" : "NOT SET",
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? "SET" : "NOT SET"
  }

  return res.status(200).json({
    message: "Environment variables test",
    envVars,
    timestamp: new Date().toISOString()
  })
} 