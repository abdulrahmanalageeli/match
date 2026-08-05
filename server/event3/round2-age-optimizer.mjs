function normalizedGender(value) {
  const gender = String(value || "").trim().toLowerCase()
  if (gender.startsWith("f") || gender === "أنثى" || gender === "انثى") return "female"
  if (gender.startsWith("m") || gender === "ذكر") return "male"
  return "unknown"
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
