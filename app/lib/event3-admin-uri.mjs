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
