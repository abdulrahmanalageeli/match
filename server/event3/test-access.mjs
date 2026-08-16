export function isEvent3TestImpersonation(value) {
  return value === true || value === 1 || value === "1"
}

export function canAccessEvent3DuringTest({ testModeActive = false, impersonate = false } = {}) {
  return testModeActive !== true || isEvent3TestImpersonation(impersonate)
}
