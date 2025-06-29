// /routes/matrix.tsx
import React, { useEffect, useState } from "react"

type MatchResult = {
  participant_a_number: number
  participant_b_number: number
  compatibility_score: number
}

export default function MatrixPage() {
  const [matrix, setMatrix] = useState<number[][]>([])
  const [participants, setParticipants] = useState<number[]>([])

  useEffect(() => {
    const fetchMatrix = async () => {
      const res = await fetch("/api/admin/match-results")
      const data = await res.json()
      const results: MatchResult[] = data.results

      const unique = Array.from(
        new Set(results.flatMap(r => [r.participant_a_number, r.participant_b_number]))
      ).filter(n => n !== 0).sort((a, b) => a - b)

      const indexMap = new Map(unique.map((n, i) => [n, i]))
      const size = unique.length
      const grid = Array.from({ length: size }, () => Array(size).fill(0))

      results.forEach(r => {
        const i = indexMap.get(r.participant_a_number)
        const j = indexMap.get(r.participant_b_number)
        if (i !== undefined && j !== undefined) {
          grid[i][j] = r.compatibility_score
          grid[j][i] = r.compatibility_score
        }
      })

      setMatrix(grid)
      setParticipants(unique)
    }

    fetchMatrix()
  }, [])

  return (
    <div className="min-h-screen p-6 bg-white">
      <h1 className="text-2xl font-bold mb-6">🔢 Compatibility Matrix</h1>
      <div className="overflow-auto">
        <table className="border-collapse">
          <thead>
            <tr>
              <th className="border p-2 bg-gray-100">#</th>
              {participants.map((p) => (
                <th key={p} className="border p-2 bg-gray-100">{p}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, i) => (
              <tr key={participants[i]}>
                <th className="border p-2 bg-gray-100">{participants[i]}</th>
                {row.map((score, j) => {
                  const isMax = score === Math.max(...row.filter((s, k) => k !== i))
                  const bg = i === j
                    ? "bg-gray-200"
                    : isMax
                    ? "bg-yellow-200 font-bold"
                    : "bg-white"
                  return (
                    <td key={j} className={`border p-2 text-center ${bg}`}>
                      {i === j ? "—" : score}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
