// A disconnected database must not occupy a function for Vercel's full 300s.
// Never retry writes here: a timed-out write may already have committed.
export function createDatabaseFetch(fetcher = globalThis.fetch, { readTimeoutMs = 15_000, writeTimeoutMs = 60_000 } = {}) {
  return async function databaseFetch(input, init = {}) {
    const method = (init.method || input?.method || 'GET').toUpperCase()
    const controller = new AbortController()
    const signal = init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal
    // PostgREST retries generic network errors; AbortError makes this a final
    // deadline rather than starting another request against an unavailable DB.
    const timeout = setTimeout(() => controller.abort(new DOMException('Database request timed out', 'AbortError')), method === 'GET' || method === 'HEAD' ? readTimeoutMs : writeTimeoutMs)
    try {
      const response = await fetcher(input, { ...init, signal })
      // Include body transfer in the deadline, not just response headers.
      const body = await response.arrayBuffer()
      if ([502, 503, 504, 522, 523, 524].includes(response.status)) {
        return new Response(JSON.stringify({ code: 'DATABASE_UNAVAILABLE', message: 'Database temporarily unavailable. Please retry shortly.' }), { status: 503, headers: { 'Content-Type': 'application/json', 'Retry-After': '15' } })
      }
      return new Response(body.byteLength ? body : null, { status: response.status, statusText: response.statusText, headers: response.headers })
    } finally {
      clearTimeout(timeout)
    }
  }
}
