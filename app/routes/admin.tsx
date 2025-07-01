import React, { useState, useEffect } from "react"
import { UserRound, QrCode, Trash2, Table2, LockKeyhole, RefreshCcw, LayoutDashboard, Loader2 } from "lucide-react"

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
      <div className="min-h-screen flex items-center justify-center bg-neutral-900 p-6">
        <div className="bg-neutral-800 text-white p-6 rounded shadow-lg w-full max-w-sm space-y-4">
          <h1 className="text-2xl font-bold flex items-center justify-center gap-2">
            <LockKeyhole className="w-6 h-6" /> Admin Login
          </h1>
          <input
            type="password"
            placeholder="Enter Admin Password"
            className="w-full p-2 rounded bg-neutral-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
    <div className="min-h-screen bg-neutral-100 p-6">
      <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <LayoutDashboard className="w-6 h-6" /> Participants ({participants.length})
        </h1>

        <div className="flex gap-2 flex-wrap">
          <select
            className="border px-3 py-1 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded"
          >
            <Table2 className="w-4 h-4" /> Auto Assign
          </button>

          <button
            onClick={triggerMatching}
            className="flex items-center gap-1 bg-green-600 hover:bg-green-500 text-white px-3 py-2 rounded"
          >
            <RefreshCcw className="w-4 h-4" /> Match
          </button>

          <button
            onClick={openMatrix}
            className="flex items-center gap-1 bg-yellow-600 hover:bg-yellow-500 text-white px-3 py-2 rounded"
          >
            <LayoutDashboard className="w-4 h-4" /> Matrix
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap items-end">
        <input
          type="number"
          value={manualNumber ?? ""}
          onChange={(e) => setManualNumber(Number(e.target.value))}
          placeholder="رقم المشارك"
          className="w-28 p-2 rounded border focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
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
          className="flex items-center gap-1 bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded disabled:opacity-50"
        >
          <QrCode className="w-4 h-4" /> QR
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {participants.map((p) => (
            <div
              key={p.id}
              className="bg-white p-4 rounded shadow hover:shadow-lg cursor-pointer transition transform hover:scale-105"
              onClick={() => setDetailParticipant(p)}
            >
              <div className="flex flex-col items-center gap-1">
                <div className="bg-blue-100 rounded-full p-2">
                  <UserRound className="w-6 h-6 text-blue-600" />
                </div>
                <div className="font-bold">#{p.assigned_number}</div>
                <div className="text-sm text-gray-500 flex items-center gap-1">
                  <Table2 className="w-4 h-4" /> {p.table_number ?? "?"}
                </div>
                <div className="text-xs text-gray-400 truncate w-full text-center italic">
                  “{p.q1}”
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {detailParticipant && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-white rounded p-6 shadow-lg w-80 space-y-3">
            <h2 className="text-xl font-bold text-center flex items-center justify-center gap-1">
              <UserRound className="w-5 h-5" /> #{detailParticipant.assigned_number}
            </h2>
            <div className="text-sm space-y-1">
              <div><strong>Table:</strong> {detailParticipant.table_number ?? "-"}</div>
              <div><strong>Q1:</strong> {detailParticipant.q1}</div>
              <div><strong>Q2:</strong> {detailParticipant.q2}</div>
              <div><strong>Q3:</strong> {detailParticipant.q3}</div>
              <div><strong>Q4:</strong> {detailParticipant.q4}</div>
            </div>
            <div className="flex gap-1">
              <input
                type="number"
                defaultValue={detailParticipant.table_number ?? ""}
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
                className="w-16 p-1 border rounded text-center"
              />
              <button
                onClick={() => deleteParticipant(detailParticipant.assigned_number)}
                className="flex items-center gap-1 text-red-600 hover:bg-red-100 rounded px-2 py-1 text-sm"
              >
                <Trash2 className="w-4 h-4" /> حذف
              </button>
              <button
                onClick={() => setQrParticipant(detailParticipant)}
                className="flex items-center gap-1 text-gray-600 hover:bg-gray-100 rounded px-2 py-1 text-sm"
              >
                <QrCode className="w-4 h-4" /> QR
              </button>
            </div>
            <button
              onClick={() => setDetailParticipant(null)}
              className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-500"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {qrParticipant && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-white rounded p-6 shadow-lg text-center w-72 space-y-3">
            <h2 className="text-lg font-bold">
              <QrCode className="inline-block w-5 h-5" /> QR: #{qrParticipant.assigned_number}
            </h2>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                `${window.location.origin}/welcome?token=${qrParticipant.secure_token}`
              )}`}
              alt="QR Code"
              className="mx-auto"
            />
            <p className="text-xs break-all">
              {`${window.location.origin}/welcome?token=${qrParticipant.secure_token}`}
            </p>
            <button
              onClick={() => setQrParticipant(null)}
              className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-500"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
