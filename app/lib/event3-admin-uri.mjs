const ENABLED_ADMIN_VALUES = new Set(["", "1", "true", "on"])

/**
 * The host can enter Event3 while the participant gate is closed by adding an
 * explicit admin marker to the URL. `%admin` is accepted when percent-encoded
 * as `%25admin`; `?admin` is the preferred form.
 */
export function hasEvent3AdminUriOverride(search) {
  const params = search instanceof URLSearchParams
    ? search
    : new URLSearchParams(String(search || "").replace(/^\?/, ""))

  for (const key of ["admin", "%admin"]) {
    if (!params.has(key)) continue
    const value = String(params.get(key) ?? "").trim().toLowerCase()
    return ENABLED_ADMIN_VALUES.has(value)
  }
  return false
}

/**
 * Build an Event3 URL by updating the current query instead of replacing it.
 * Test-mode access lives in the URI, so unrelated navigation must never drop
 * markers such as `impersonate=1` or the explicit admin override.
 */
export function buildEvent3Uri(search, { remove = [], set = {} } = {}) {
  const params = new URLSearchParams(
    search instanceof URLSearchParams
      ? search.toString()
      : String(search || "").replace(/^\?/, ""),
  )

  for (const key of remove) params.delete(String(key))
  for (const [key, value] of Object.entries(set)) {
    if (value == null) params.delete(key)
    else params.set(key, String(value))
  }

  const query = params.toString()
  return query ? `/event3?${query}` : "/event3"
}
