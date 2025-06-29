import { useEffect, useState } from "react"

export default function MatchResult({ assignedNumber }: { assignedNumber: number | null }) {
  const [matches, setMatches] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!assignedNumber) return

    const fetchMatches = async () => {
      const res = await fetch("/api/get-my-matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigned_number: assignedNumber }),
      })
      const data = await res.json()
      setMatches(data.matches || [])
      setLoading(false)
    }

    fetchMatches()
  }, [assignedNumber])

  if (loading) return <p className="text-sm text-muted-foreground">جاري تحميل النتائج...</p>

  if (matches.length === 0) return <p className="text-sm text-muted-foreground">ما في نتائج تطابق حتى الآن.</p>

  return (
    <ul className="space-y-3 text-right max-w-md mx-auto">
      {matches.map((m, i) => (
        <li key={i} className="border border-border rounded-lg p-3 bg-muted/30 shadow-sm">
          <p className="font-bold text-sm">مع المشارك رقم {m.with}</p>
          <p className="text-sm text-muted-foreground italic">
            النوع: {m.type} — {m.reason}
          </p>
        </li>
      ))}
    </ul>
  )
}
