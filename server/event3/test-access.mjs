export function isEvent3TestImpersonation(value) {
  return value === true || value === 1 || value === "1"
}

export function isEvent3AdminOverride(value) {
  if (value === true || value === 1) return true
  if (value == null || value === false || value === 0) return false
  return ["", "1", "true", "on"].includes(String(value).trim().toLowerCase())
}

export function canAccessEvent3DuringTest({
  testModeActive = false,
  participantAccessLocked = false,
  impersonate = false,
  adminOverride = false,
} = {}) {
  const accessLocked = testModeActive === true || participantAccessLocked === true
  return !accessLocked
    || isEvent3TestImpersonation(impersonate)
    || isEvent3AdminOverride(adminOverride)
}
