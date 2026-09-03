import {
  processCompatibilityVibeEnrichmentBatch,
  verifyCompatibilityVibeWorkerRequest,
} from './trigger-match.mjs'

export const config = { maxDuration: 60 }

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Only GET or POST allowed' })
  }

  const authorized = await verifyCompatibilityVibeWorkerRequest({
    timestamp: req.headers['x-vibe-worker-timestamp'],
    nonce: req.headers['x-vibe-worker-nonce'],
    signature: req.headers['x-vibe-worker-signature'],
  })
  if (!authorized) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  res.setHeader('Cache-Control', 'no-store')
  try {
    const result = await processCompatibilityVibeEnrichmentBatch({ limit: 12 })
    return res.status(200).json({ success: true, ...result })
  } catch (error) {
    console.error('Durable AI vibe worker failed:', error)
    return res.status(500).json({
      success: false,
      error: error?.message || 'Durable AI vibe worker failed',
    })
  }
}
