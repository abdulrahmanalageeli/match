export const EVENT3_COHOST_ACCOUNTS = Object.freeze({
  1372: Object.freeze({ number: 1372, displayName: "سلطان" }),
  1470: Object.freeze({ number: 1470, displayName: "ريهام" }),
})

export function getEvent3CohostAccount(participantNumber) {
  const number = Number(participantNumber)
  if (!Number.isInteger(number)) return null
  return EVENT3_COHOST_ACCOUNTS[number] || null
}

export function buildEvent3CohostIdentity(participant) {
  const account = getEvent3CohostAccount(participant?.assigned_number)
  if (!account) return null
  const profileName = typeof participant?.name === "string" ? participant.name.trim().replace(/\s+/gu, " ") : ""
  return Object.freeze({
    number: account.number,
    displayName: account.displayName,
    profileName: profileName || account.displayName,
  })
}

export function isValidEvent3CohostClaims(claims) {
  const account = getEvent3CohostAccount(claims?.cohost_number)
  return Boolean(account && claims?.cohost_display_name === account.displayName)
}

export function event3CohostAgreementName(identity) {
  const account = getEvent3CohostAccount(identity?.number)
  if (!account) return null
  const profileName = typeof identity?.profileName === "string" ? identity.profileName.trim().replace(/\s+/gu, " ") : ""
  return `${profileName || account.displayName} (#${account.number})`
}
