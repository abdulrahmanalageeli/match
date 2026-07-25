import { useState, useEffect, useRef, useCallback } from "react"
import { X, Send, ArrowLeft, Image as ImageIcon, Loader2, RefreshCw, MessageSquare, Inbox } from "lucide-react"

interface Message {
  id: string
  assigned_number: number | null
  phone_number: string | null
  direction: string
  message_body: string | null
  button_payload: string | null
  button_text: string | null
  media_url: string | null
  media_content_type: string | null
  template_sid: string | null
  is_auto_reply: boolean
  status: string
  created_at: string
  participant_name?: string | null
}

interface WhatsAppChatModalProps {
  participant: any | null
  isOpen: boolean
  onClose: () => void
  cohostTheme?: boolean
  onSelectParticipant?: (assignedNumber: number) => void
}

export default function WhatsAppChatModal({ participant, isOpen, onClose, cohostTheme = false, onSelectParticipant }: WhatsAppChatModalProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [replyText, setReplyText] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")
  const [showInbox, setShowInbox] = useState(false)
  const [inbox, setInbox] = useState<Message[]>([])
  const [inboxLoading, setInboxLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const assignedNumber = participant?.assigned_number
  const participantName = participant?.name || participant?.survey_data?.name || `المشارك #${assignedNumber}`
  const phoneNumber = participant?.phone_number

  const fetchConversation = useCallback(async () => {
    if (!assignedNumber) return
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get-whatsapp-conversation", assigned_number: assignedNumber }),
      })
      const data = await res.json()
      if (res.ok && data?.success) {
        setMessages(data.messages || [])
      }
    } catch (e) {
      console.error("Failed to fetch conversation", e)
    }
  }, [assignedNumber])

  const fetchConversationForNumber = useCallback(async (num: number) => {
    try {
      setLoading(true)
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get-whatsapp-conversation", assigned_number: num }),
      })
      const data = await res.json()
      if (res.ok && data?.success) {
        setMessages(data.messages || [])
      }
    } catch (e) {
      console.error("Failed to fetch conversation for number", e)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchInbox = useCallback(async () => {
    setInboxLoading(true)
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get-whatsapp-inbox" }),
      })
      const data = await res.json()
      if (res.ok && data?.success) {
        setInbox(data.messages || [])
      }
    } catch (e) {
      console.error("Failed to fetch inbox", e)
    } finally {
      setInboxLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) {
      setMessages([])
      setReplyText("")
      setError("")
      setShowInbox(false)
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      return
    }

    if (showInbox) {
      fetchInbox()
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      pollRef.current = setInterval(fetchInbox, 10000)
      return
    }

    if (assignedNumber) {
      setLoading(true)
      fetchConversation().finally(() => setLoading(false))
      // Poll for new messages every 5 seconds
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = setInterval(fetchConversation, 5000)
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [isOpen, assignedNumber, showInbox, fetchConversation, fetchInbox])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSendReply = async () => {
    if (!replyText.trim() || !assignedNumber) return
    setSending(true)
    setError("")
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send-whatsapp-reply", assigned_number: assignedNumber, message: replyText.trim() }),
      })
      const data = await res.json()
      if (!res.ok || !data?.success) {
        setError(data?.error || "Failed to send")
        return
      }
      setReplyText("")
      // Immediately add a local optimistic message
      setMessages(prev => [...prev, {
        id: `local_${Date.now()}`,
        assigned_number: assignedNumber,
        phone_number: phoneNumber,
        direction: "outbound",
        message_body: replyText.trim(),
        button_payload: null,
        button_text: null,
        media_url: null,
        media_content_type: null,
        template_sid: null,
        is_auto_reply: false,
        status: data.status || "sent",
        created_at: new Date().toISOString(),
      }])
      // Also refetch to get the DB version
      setTimeout(fetchConversation, 1000)
    } catch (e) {
      setError("Network error")
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSendReply()
    }
  }

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso)
      return d.toLocaleString("ar-SA", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })
    } catch {
      return iso
    }
  }

  const renderMessageContent = (msg: Message) => {
    if (msg.media_url) {
      const isImage = msg.media_content_type?.startsWith("image/")
      return (
        <div className="space-y-1">
          {msg.message_body && <p className="whitespace-pre-wrap break-words">{msg.message_body}</p>}
          {isImage ? (
            <img src={msg.media_url} alt="media" className="rounded-lg max-w-[200px] max-h-[200px] object-cover" />
          ) : (
            <a href={msg.media_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm">
              <ImageIcon className="w-4 h-4" />
              <span>View attachment ({msg.media_content_type})</span>
            </a>
          )}
        </div>
      )
    }
    if (msg.button_payload) {
      return (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs opacity-70">
            <span className="px-2 py-0.5 rounded bg-white/10">Button: {msg.button_text || msg.button_payload}</span>
          </div>
        </div>
      )
    }
    return <p className="whitespace-pre-wrap break-words">{msg.message_body || "(empty)"}</p>
  }

  if (!isOpen) return null

  const accentClasses = cohostTheme
    ? "from-rose-500 to-pink-500"
    : "from-green-500 to-emerald-500"

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-2 md:p-4">
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-2xl h-[85vh] md:h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className={`flex items-center justify-between px-4 py-3 border-b border-white/10 bg-gradient-to-r ${accentClasses}/20`}>
          <div className="flex items-center gap-3 min-w-0">
            {showInbox && (
              <button
                onClick={() => setShowInbox(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors flex-shrink-0"
              >
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
            )}
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white font-bold text-sm">
              {showInbox ? <Inbox className="w-5 h-5" /> : `#${assignedNumber || "?"}`}
            </div>
            <div className="min-w-0">
              <div className="text-white font-semibold truncate">
                {showInbox ? "Inbox — Latest Incoming" : participantName}
              </div>
              <div className="text-xs text-white/60 truncate">
                {showInbox ? `${inbox.length} messages` : phoneNumber || "No phone number"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {!showInbox && (
              <button
                onClick={() => setShowInbox(true)}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/70 hover:text-white"
                title="View inbox"
              >
                <Inbox className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={() => {
                if (showInbox) fetchInbox()
                else fetchConversation()
              }}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/70 hover:text-white"
              title="Refresh"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/70 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-slate-950/50">
          {showInbox ? (
            inboxLoading && inbox.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 animate-spin text-white/40" />
              </div>
            ) : inbox.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-white/40">
                <Inbox className="w-12 h-12 mb-2 opacity-50" />
                <p>No incoming messages yet</p>
              </div>
            ) : (
              inbox.map((msg) => (
                <div
                  key={msg.id}
                  onClick={() => {
                    if (msg.assigned_number) {
                      setShowInbox(false)
                      if (onSelectParticipant) {
                        onSelectParticipant(msg.assigned_number)
                      } else if (msg.assigned_number !== assignedNumber) {
                        // Fallback: fetch conversation directly for the clicked participant
                        fetchConversationForNumber(msg.assigned_number)
                      }
                    }
                  }}
                  className="bg-white/5 border border-white/10 rounded-xl p-3 hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-green-400">#{msg.assigned_number || "?"}</span>
                      {msg.participant_name && (
                        <span className="text-xs text-white/60 truncate">{msg.participant_name}</span>
                      )}
                    </div>
                    <span className="text-xs text-white/40 flex-shrink-0">{formatTime(msg.created_at)}</span>
                  </div>
                  <div className="text-sm text-white/80">
                    {msg.button_payload ? (
                      <span className="text-blue-400">🔘 {msg.button_text || msg.button_payload}</span>
                    ) : msg.media_url ? (
                      <span className="flex items-center gap-1 text-blue-400">
                        <ImageIcon className="w-4 h-4" /> {msg.media_content_type || "Media"}
                      </span>
                    ) : (
                      <p className="line-clamp-2">{msg.message_body}</p>
                    )}
                  </div>
                </div>
              ))
            )
          ) : loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 animate-spin text-white/40" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-white/40">
              <MessageSquare className="w-12 h-12 mb-2 opacity-50" />
              <p>No messages yet</p>
              <p className="text-xs mt-1">Send a message to start the conversation</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isOutbound = msg.direction === "outbound"
              return (
                <div
                  key={msg.id}
                  className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[75%] rounded-2xl px-3 py-2 ${
                      isOutbound
                        ? `bg-gradient-to-br ${accentClasses} text-white rounded-br-sm`
                        : "bg-white/10 text-white rounded-bl-sm"
                    }`}
                  >
                    {msg.is_auto_reply && isOutbound && (
                      <div className="text-xs opacity-60 mb-1 flex items-center gap-1">
                        <span className="px-1.5 py-0.5 rounded bg-white/20 text-[10px]">AUTO</span>
                      </div>
                    )}
                    {msg.template_sid && isOutbound && (
                      <div className="text-xs opacity-60 mb-1 flex items-center gap-1">
                        <span className="px-1.5 py-0.5 rounded bg-white/20 text-[10px]">TEMPLATE</span>
                      </div>
                    )}
                    <div className="text-sm">
                      {renderMessageContent(msg)}
                    </div>
                    <div className={`text-[10px] mt-1 ${isOutbound ? "text-white/60" : "text-white/40"}`}>
                      {formatTime(msg.created_at)}
                      {isOutbound && msg.status && ` · ${msg.status}`}
                    </div>
                  </div>
                </div>
              )
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Reply input area */}
        {!showInbox && (
          <div className="px-4 py-3 border-t border-white/10 bg-slate-900">
            {error && (
              <div className="mb-2 text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-1.5">
                {error}
              </div>
            )}
            <div className="flex items-end gap-2">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a reply... (Enter to send, Shift+Enter for new line)"
                rows={1}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30 resize-none focus:outline-none focus:border-white/30 transition-colors max-h-24 overflow-y-auto"
                disabled={sending || !phoneNumber}
              />
              <button
                onClick={handleSendReply}
                disabled={sending || !replyText.trim() || !phoneNumber}
                className={`p-2.5 rounded-xl bg-gradient-to-br ${accentClasses} text-white disabled:opacity-30 disabled:cursor-not-allowed hover:scale-105 active:scale-95 transition-transform flex-shrink-0`}
              >
                {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            </div>
            {!phoneNumber && (
              <div className="text-xs text-white/40 mt-1">No phone number for this participant</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
