import React, { useState, useEffect } from "react"

export default function AdminPage() {
  const [password, setPassword] = useState("")
  const [authenticated, setAuthenticated] = useState(false)
  const [participants, setParticipants] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [qrParticipant, setQrParticipant] = useState<any | null>(null)
  const [manualNumber, setManualNumber] = useState<number | null>(null)

  const STATIC_PASSWORD = "soulmatch2025"

  const fetchParticipants = async () => {
    setLoading(true)
    try {
const res = await fetch("/api/admin", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "participants" }),
})
      const data = await res.json()
      setParticipants(data.participants || [])
    } catch (err) {
      console.error("Fetch error:", err)
    } finally {
      setLoading(false)
    }
  }

  const deleteParticipant = async (assigned_number: number) => {
    if (!confirm(`Are you sure you want to delete participant #${assigned_number}?`)) return
await fetch("/api/admin", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "delete", assigned_number }),
})
    fetchParticipants()
  }

  const triggerMatching = async () => {
    if (!confirm("Are you sure you want to trigger the matching for all participants?")) return
    setLoading(true)
const res = await fetch("/api/admin/trigger-match", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
})
    const data = await res.json()
    alert(`✅ Done.\n\n${data.analysis}`)
    fetchParticipants()
  }

  const openMatrix = () => {
    window.open("/matrix", "_blank", "width=1000,height=800")
  }

  const login = () => {
    if (password === STATIC_PASSWORD) {
      localStorage.setItem("admin", "authenticated")
      setAuthenticated(true)
      fetchParticipants()
    } else {
      alert("❌ Wrong password.")
    }
  }

  useEffect(() => {
    if (localStorage.getItem("admin") === "authenticated") {
      setAuthenticated(true)
      fetchParticipants()
    }
  }, [])

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-black text-white">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="text-xl font-bold">🔐 Admin Login</h1>
          <input
            type="password"
            placeholder="Enter Admin Password"
            className="w-full p-2 rounded bg-white text-black"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2 rounded"
            onClick={login}
          >
            Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 bg-gray-100 min-h-screen">
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold">👥 Participants ({participants.length})</h1>

        <div className="flex gap-3 items-center">
          <div>
            <label className="block text-sm font-semibold mb-1">🧭 Set Phase:</label>
            <select
              className="border px-3 py-1 rounded text-sm"
              onChange={async (e) => {
const res = await fetch("/api/admin", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    action: "set-phase",
    match_id: "00000000-0000-0000-0000-000000000000",
    phase: e.target.value,
  }),
})
                const data = await res.json()
                if (!res.ok) {
                  alert("❌ Error: " + data.error)
                } else {
                  alert("✅ Phase updated to " + e.target.value)
                }
              }}
            >
              <option value="waiting">waiting</option>
              <option value="form">form</option>
              <option value="matching">matching</option>
            </select>
          </div>

          <button
            onClick={async () => {
              if (!confirm("Assign table numbers to everyone?")) return
await fetch("/api/admin", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "set-table" }),
})
              fetchParticipants()
            }}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded"
          >
            🪑 Auto Assign Tables
          </button>

          <button
            onClick={triggerMatching}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-500"
          >
            🔄 Trigger Matching
          </button>

          <button
            onClick={openMatrix}
            className="bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-500"
          >
            📊 Show Matrix
          </button>
        </div>
      </div>

      {/* Manual QR generator */}
      <div className="mb-6 flex items-end gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">🎯 رقم المشارك:</label>
          <input
            type="number"
            value={manualNumber ?? ""}
            onChange={(e) => setManualNumber(Number(e.target.value))}
            className="w-28 p-2 rounded border"
            placeholder="مثلاً: 17"
          />
        </div>
        <button
          disabled={!manualNumber}
          onClick={async () => {
          const res = await fetch("/api/token-handler", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "create", assigned_number: manualNumber }),
          })

            const data = await res.json()
            if (data.secure_token) {
              setQrParticipant({
                assigned_number: manualNumber,
                secure_token: data.secure_token,
              })
              setManualNumber(null)
              fetchParticipants()
            } else {
              alert("❌ فشل في توليد الرابط")
            }
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-500 disabled:opacity-50"
        >
          توليد QR
        </button>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <table className="w-full border bg-white rounded shadow">
          <thead>
            <tr className="bg-gray-200 text-sm">
              <th className="p-2">#</th>
              <th>Table</th>
              <th>Q1</th>
              <th>Q2</th>
              <th>Q3</th>
              <th>Q4</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {participants.map((p) => (
              <tr key={p.id} className="border-t text-sm">
                <td className="p-2 font-bold text-center">{p.assigned_number}</td>
                <td className="text-center">{p.table_number ?? "-"}</td>
                <td>{p.q1}</td>
                <td>{p.q2}</td>
                <td>{p.q3}</td>
                <td>{p.q4}</td>
                <td className="flex items-center justify-end gap-2 pr-4">
                  <input
                    type="number"
                    value={p.table_number ?? ""}
                    onChange={async (e) => {
                      const table_number = Number(e.target.value)
await fetch("/api/admin", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "update-table", assigned_number: p.assigned_number, table_number }),
})
                      fetchParticipants()
                    }}
                    className="w-16 p-1 border rounded text-center text-sm"
                    placeholder="جدول"
                  />
                  <button
                    onClick={() => deleteParticipant(p.assigned_number)}
                    className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-400"
                  >
                    حذف
                  </button>
                  <button
                    onClick={() => setQrParticipant(p)}
                    className="bg-gray-300 px-2 py-1 rounded text-xs hover:bg-gray-400"
                  >
                    QR
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* QR Modal */}
      {qrParticipant && (
        <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded shadow-lg text-center space-y-4 w-72">
            <h2 className="text-xl font-bold">
              QR: رقم {qrParticipant.assigned_number}
            </h2>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                `${window.location.origin}/welcome?token=${qrParticipant.secure_token}`
              )}`}
              alt="QR Code"
              className="mx-auto"
            />
            <button
              onClick={() => setQrParticipant(null)}
              className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
