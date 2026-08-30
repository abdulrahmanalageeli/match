const reads = /^(get-|e3-get-|e3-cohost-(dashboard|rankings)$|e3-check-)/

export function adminReadAction(input, init = {}) {
  const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url, 'http://local.invalid')
  if (url.pathname !== '/api/admin') return null
  const method = (init.method || input?.method || 'GET').toUpperCase()
  let action = url.searchParams.get('action') || ''
  try { if (typeof init.body === 'string') action = JSON.parse(init.body).action || action } catch { /* handled by API */ }
  return method === 'GET' || reads.test(action) ? action || 'participants' : null
}

export function createAdminFetch(fetcher = globalThis.fetch, { readTimeoutMs = 20_000, notify = () => {} } = {}) {
  const pending = new Map()
  return async function adminFetch(input, init = {}) {
    const action = adminReadAction(input, init)
    if (!action) return fetcher(input, init)
    // Credentials, selected event, filters, and identity all participate in the key.
    // Only share reads; each caller receives its own consumable Response.
    const headers = [...new Headers(init.headers).entries()]
    const key = JSON.stringify([typeof input === 'string' || input instanceof URL ? String(input) : input.url, init.method || 'GET', init.credentials || 'same-origin', headers, init.body])
    if (pending.has(key)) return (await pending.get(key)).clone()
    const operation = (async () => {
      const controller = new AbortController()
      const signal = init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal
      const timer = setTimeout(() => controller.abort(), readTimeoutMs)
      notify({ action, state: 'pending', at: Date.now() })
      try {
        const response = await fetcher(input, { ...init, signal })
        const body = await response.arrayBuffer()
        if (!response.ok) {
          notify({ action, state: 'error', at: Date.now(), status: response.status })
          if (response.status >= 500) throw Object.assign(new Error('تعذّر تحديث البيانات مؤقتًا. احتفظنا بآخر بيانات؛ حاول مجددًا.'), { status: response.status })
          // Preserve auth/lock response bodies for the route's existing guards.
          return new Response(body.byteLength ? body : null, { status: response.status, headers: response.headers })
        }
        notify({ action, state: 'success', at: Date.now() })
        return new Response(body.byteLength ? body : null, { status: response.status, headers: response.headers })
      } catch (error) {
        notify({ action, state: 'error', at: Date.now() })
        throw error
      } finally { clearTimeout(timer) }
    })()
    pending.set(key, operation)
    try { return (await operation).clone() } finally { if (pending.get(key) === operation) pending.delete(key) }
  }
}

export const adminFetch = createAdminFetch(globalThis.fetch, {
  notify: detail => {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('admin-connection-status', { detail }))
  },
})
