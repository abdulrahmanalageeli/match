export const ROSTER_GENDERS = new Set(["male", "female"])

export function buildNumberedRosterRows({
  eventId,
  count,
  startNumber = 1,
  maleCount = 0,
  femaleCount = 0,
}) {
  const total = Number(count)
  const firstNumber = Number(startNumber)
  if (!eventId) throw new Error("An event ID is required")
  if (!Number.isInteger(total) || total < 0) throw new Error("Roster count must be a non-negative integer")
  if (!Number.isInteger(firstNumber) || firstNumber < 1) throw new Error("Starting number must be a positive integer")

  let men = Number(maleCount) || 0
  let women = Number(femaleCount) || 0
  return Array.from({ length: total }, (_, index) => {
    const attendeeNumber = firstNumber + index
    const gender = women <= men ? "female" : "male"
    if (gender === "female") women += 1
    else men += 1
    return {
      event_id: eventId,
      attendee_number: attendeeNumber,
      full_name: `Guest ${attendeeNumber}`,
      gender,
      attendance_status: "confirmed",
      included_in_schedule: true,
      amount_due: 0,
    }
  })
}

export function buildRosterForGenderCounts({ eventId, femaleCount, maleCount, startNumber = 1 }) {
  const women = Number(femaleCount)
  const men = Number(maleCount)
  const firstNumber = Number(startNumber)
  if (!eventId) throw new Error("An event ID is required")
  if (!Number.isInteger(women) || women < 0 || !Number.isInteger(men) || men < 0) {
    throw new Error("Gender counts must be non-negative integers")
  }
  if (!Number.isInteger(firstNumber) || firstNumber < 1) throw new Error("Starting number must be a positive integer")

  let remainingWomen = women
  let remainingMen = men
  let lastGender = women >= men ? "male" : "female"
  return Array.from({ length: women + men }, (_, index) => {
    const gender = remainingWomen > 0 && (remainingMen === 0 || lastGender === "male")
      ? "female"
      : "male"
    if (gender === "female") remainingWomen -= 1
    else remainingMen -= 1
    lastGender = gender
    const attendeeNumber = firstNumber + index
    return {
      event_id: eventId,
      attendee_number: attendeeNumber,
      full_name: `Guest ${attendeeNumber}`,
      gender,
      attendance_status: "confirmed",
      included_in_schedule: true,
      amount_due: 0,
    }
  })
}

export function rosterGenderCounts(attendees = []) {
  return attendees.reduce((counts, attendee) => {
    if (attendee?.gender === "male") counts.male += 1
    if (attendee?.gender === "female") counts.female += 1
    return counts
  }, { male: 0, female: 0 })
}
