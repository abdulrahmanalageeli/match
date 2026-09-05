export function normalizedGender(value) {
  const gender = String(value || "").trim().toLowerCase()
  if (gender.startsWith("f") || gender === "أنثى" || gender === "انثى") return "female"
  if (gender.startsWith("m") || gender === "ذكر") return "male"
  return "unknown"
}

function combinations(values, count, start = 0, chosen = [], result = []) {
  if (chosen.length === count) {
    result.push([...chosen])
    return result
  }
  for (let i = start; i <= values.length - (count - chosen.length); i++) {
    chosen.push(values[i])
    combinations(values, count, i + 1, chosen, result)
    chosen.pop()
  }
  return result
}

// With six destinations for each seven-person source table, one repeated pair
// is unavoidable. Keep that pair female/female and balance genders both rounds.
export function buildSixBySevenPlan(participantNumbers, genderMap = {}) {
  if (participantNumbers?.length !== 42) return null
  const females = participantNumbers.filter(number => normalizedGender(genderMap[number]) === "female")
  const others = participantNumbers.filter(number => normalizedGender(genderMap[number]) !== "female")
  if (females.length < 12) return null

  const base = Math.floor(females.length / 6)
  const remainder = females.length % 6
  const femaleTargets = Array.from({ length: 6 }, (_, table) => base + (table < remainder ? 1 : 0))
  if (femaleTargets.some(count => count < 2 || count > 7)) return null

  const choices = femaleTargets.map(target => combinations([1, 2, 3, 4, 5], target - 2))
  const selected = Array(6)
  const destinationFemaleCounts = Array(6).fill(2)
  const chooseColumns = table => {
    if (table === 6) return destinationFemaleCounts.every((count, i) => count === femaleTargets[i])
    for (const femaleColumns of choices[table]) {
      const destinations = femaleColumns.map(column => (table + column) % 6)
      if (destinations.some(destination => destinationFemaleCounts[destination] >= femaleTargets[destination])) continue
      destinations.forEach(destination => destinationFemaleCounts[destination]++)
      selected[table] = new Set([0, 6, ...femaleColumns])
      if (chooseColumns(table + 1)) return true
      destinations.forEach(destination => destinationFemaleCounts[destination]--)
    }
    return false
  }
  if (!chooseColumns(0)) return null

  let femaleIndex = 0, otherIndex = 0
  const round1 = Array.from({ length: 6 }, (_, table) =>
    Array.from({ length: 7 }, (_, column) => selected[table].has(column)
      ? females[femaleIndex++]
      : others[otherIndex++])
  )
  const round2 = Array.from({ length: 6 }, () => [])
  for (let table = 0; table < 6; table++) {
    for (let column = 0; column < 7; column++) round2[(table + column) % 6].push(round1[table][column])
  }
  return { round1, round2 }
}

// Choice-only Event3 uses seven six-person tables. Distribute each gender as
// evenly as capacity permits, then use six distinct column shifts so nobody
// repeats a tablemate in the structural second round.
export function buildSevenBySixPlan(participantNumbers, genderMap = {}) {
  if (participantNumbers?.length !== 42) return null
  const tableCount = 7
  const groupSize = 6
  const buckets = new Map(["female", "male", "unknown"].map(gender => [gender, []]))
  for (const number of participantNumbers) {
    buckets.get(normalizedGender(genderMap[number]))?.push(number)
  }
  // Fill the 7x6 grid by columns. A complete gender column contributes one
  // participant of that gender to every table in every shifted round. This
  // makes a 21/21 roster exactly 3/3 at all seven tables while preserving the
  // six distinct column shifts required for zero repeated tablemates.
  const ordered = [
    ...buckets.get("female"),
    ...buckets.get("male"),
    ...buckets.get("unknown"),
  ]
  const round1 = Array.from({ length: tableCount }, () => [])
  for (let column = 0; column < groupSize; column++) {
    for (let table = 0; table < tableCount; table++) {
      round1[table].push(ordered[(column * tableCount) + table])
    }
  }

  const round2 = Array.from({ length: tableCount }, () => [])
  for (let table = 0; table < tableCount; table++) {
    for (let column = 0; column < groupSize; column++) {
      round2[(table + column) % tableCount].push(round1[table][column])
    }
  }
  return { round1, round2 }
}

function numericAge(ageMap, participantNumber) {
  const value = Number(ageMap?.[participantNumber])
  return Number.isFinite(value) && value > 0 ? value : null
}

export function round2AgeCost(groups, ageMap = {}) {
  let cost = 0
  for (const group of groups || []) {
    for (let i = 0; i < group.length; i++) {
      const ageA = numericAge(ageMap, group[i])
      if (ageA == null) continue
      for (let j = i + 1; j < group.length; j++) {
        const ageB = numericAge(ageMap, group[j])
        if (ageB == null) continue
        cost += (ageA - ageB) ** 2
      }
    }
  }
  return cost
}

function groupAgeCost(group, ageMap) {
  return round2AgeCost([group], ageMap)
}

// Improve the second round without changing any of its safety properties.
// Swapping two same-gender people who came from the same round-one table keeps:
// - every round-two table size unchanged;
// - the exact gender count at every table unchanged; and
// - the round-one repeat structure unchanged (normally zero repeats).
export function optimizeRound2ByAge(round1, round2, genderMap = {}, ageMap = {}) {
  const result = (round2 || []).map(group => [...group])
  if (!round1?.length || !result.length) return result

  const destinationOf = new Map()
  const rebuildDestinations = () => {
    destinationOf.clear()
    result.forEach((group, table) => group.forEach(number => destinationOf.set(number, table)))
  }
  rebuildDestinations()

  // Coordinate descent is deterministic and only accepts strict improvements.
  // Multiple passes allow later swaps to unlock better age bands.
  for (let pass = 0; pass < 40; pass++) {
    let improved = false
    for (const originalGroup of round1) {
      for (let i = 0; i < originalGroup.length; i++) {
        const a = originalGroup[i]
        const ageA = numericAge(ageMap, a)
        if (ageA == null) continue
        for (let j = i + 1; j < originalGroup.length; j++) {
          const b = originalGroup[j]
          const ageB = numericAge(ageMap, b)
          if (ageB == null || normalizedGender(genderMap[a]) !== normalizedGender(genderMap[b])) continue

          const tableA = destinationOf.get(a)
          const tableB = destinationOf.get(b)
          if (tableA == null || tableB == null || tableA === tableB) continue
          const indexA = result[tableA].indexOf(a)
          const indexB = result[tableB].indexOf(b)
          if (indexA < 0 || indexB < 0) continue

          const before = groupAgeCost(result[tableA], ageMap) + groupAgeCost(result[tableB], ageMap)
          result[tableA][indexA] = b
          result[tableB][indexB] = a
          const after = groupAgeCost(result[tableA], ageMap) + groupAgeCost(result[tableB], ageMap)

          if (after < before) {
            destinationOf.set(a, tableB)
            destinationOf.set(b, tableA)
            improved = true
          } else {
            result[tableA][indexA] = a
            result[tableB][indexB] = b
          }
        }
      }
    }
    if (!improved) break
  }

  return result
}
