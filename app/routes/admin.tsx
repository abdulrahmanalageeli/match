import React, { useState, useEffect } from "react"

export default function AdminPage() {
  const [password, setPassword] = useState("")
  const [authenticated, setAuthenticated] = useState(false)
  const [participants, setParticipants] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [qrParticipant, setQrParticipant] = useState<any | null>(null)
  const [detailParticipant, setDetailParticipant] = useState<any | null>(null)
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

        <div className="flex gap-3 items-center flex-wrap">
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

      <div className="mb-6 flex items-end gap-3 flex-wrap">
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {participants.map((p) => (
            <div
              key={p.id}
              className="bg-white rounded shadow p-4 flex flex-col items-center cursor-pointer hover:ring-2 hover:ring-blue-400"
              onClick={() => setDetailParticipant(p)}
            >
              <div className="text-3xl">🧑‍🎤</div>
              <div className="font-bold text-lg">#{p.assigned_number}</div>
              <div className="text-sm text-gray-600">🪑 {p.table_number ?? "?"}</div>
              <div className="text-xs text-gray-500 truncate w-full text-center">
                {p.q1}
              </div>
            </div>
          ))}
        </div>
      )}

      {detailParticipant && (
        <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded shadow-lg w-80 space-y-3">
            <h2 className="text-xl font-bold text-center">
              👤 Participant #{detailParticipant.assigned_number}
            </h2>
            <div className="text-sm">
              <div><strong>Table:</strong> {detailParticipant.table_number ?? "-"}</div>
              <div><strong>Q1:</strong> {detailParticipant.q1}</div>
              <div><strong>Q2:</strong> {detailParticipant.q2}</div>
              <div><strong>Q3:</strong> {detailParticipant.q3}</div>
              <div><strong>Q4:</strong> {detailParticipant.q4}</div>
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                defaultValue={detailParticipant.table_number ?? ""}
                placeholder="جدول"
                className="w-20 p-1 border rounded text-center"
                onBlur={async (e) => {
                  const table_number = Number(e.target.value)
                  await fetch("/api/admin", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      action: "update-table",
                      assigned_number: detailParticipant.assigned_number,
                      table_number,
                    }),
                  })
                  fetchParticipants()
                }}
              />
              <button
                onClick={() => deleteParticipant(detailParticipant.assigned_number)}
                className="bg-red-500 text-white px-2 py-1 rounded hover:bg-red-400 text-sm"
              >
                حذف
              </button>
              <button
                onClick={() => setQrParticipant(detailParticipant)}
                className="bg-gray-300 px-2 py-1 rounded hover:bg-gray-400 text-sm"
              >
                QR
              </button>
            </div>
            <button
              onClick={() => setDetailParticipant(null)}
              className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-500"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}

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
            <p className="text-sm break-all">
              {`${window.location.origin}/welcome?token=${qrParticipant.secure_token}`}
            </p>
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
