import { supabaseAdmin } from "../security/supabase-admin.mjs"
import { enforceRateLimit, requireAdmin } from "../security/request-security.mjs"

const supabase = supabaseAdmin

const STATIC_MATCH_ID = "00000000-0000-0000-0000-000000000000"
const EVENT3_MATCH_ID = "00000000-0000-0000-0000-000000000003"
const STATUS_CALLBACK_URL = process.env.TWILIO_STATUS_CALLBACK_URL || "https://blindmatch.app/api/twilio-status"

const ARABIC_WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]
const ARABIC_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"]

function formatRiyadhCutoffLabel(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/)
  if (!match) return ""
  const [, yearText, monthText, dayText, hourText, minute] = match
  const year = Number(yearText), month = Number(monthText), day = Number(dayText), hour = Number(hourText)
  const weekday = ARABIC_WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]
  return `${weekday} ${day} ${ARABIC_MONTHS[month - 1]} ${year} الساعة ${hour % 12 || 12}:${minute} ${hour < 12 ? "صباحًا" : "مساءً"}`
}

function normalizeWhatsapp(value) {
  const compact = String(value || "").replace(/\s/g, "")
  return compact.startsWith("whatsapp:") ? compact : `whatsapp:${compact}`
}

function templateEnvSid(key) {
  const envMap = {
    match: process.env.TWILIO_MATCH_TEMPLATE_SID || "HX6d318d6310d7cce0c37b1ef5e0b7a17e",
    reminder: process.env.TWILIO_REMINDER_TEMPLATE_SID,
    payment: process.env.TWILIO_PAYMENT_TEMPLATE_SID,
    gender_preference: process.env.TWILIO_GENDER_TEMPLATE_SID,
    age_flexibility: process.env.TWILIO_AGE_FLEX_TEMPLATE_SID,
    discount: process.env.TWILIO_DISCOUNT_TEMPLATE_SID,
    late_check: process.env.TWILIO_LATE_CHECK_TEMPLATE_SID,
    feedback_remaining: process.env.TWILIO_FEEDBACK_TEMPLATE_SID,
  }
  return envMap[key] || null
}

async function currentEventId() {
  const { data } = await supabase.from("event_state").select("current_event_id").eq("match_id", STATIC_MATCH_ID).maybeSingle()
  return Number(data?.current_event_id || 1)
}

async function attachEventReceipts(participants, eventId) {
  if (!participants.length) return participants
  const { data: receipts, error } = await supabase
    .from("participant_receipts")
    .select("id,participant_id,event_id,storage_path,status,received_at,reviewed_at,rejection_reason")
    .eq("event_id", eventId)
    .in("participant_id", participants.map(participant => participant.id))
    .order("received_at", { ascending: false })
    .limit(10000)
  if (error) throw error

  const latestByParticipant = new Map()
  for (const receipt of receipts || []) {
    if (!latestByParticipant.has(receipt.participant_id)) latestByParticipant.set(receipt.participant_id, receipt)
  }

  const signedUrls = new Map()
  await Promise.all((receipts || []).map(async receipt => {
    if (!receipt.storage_path) return
    const { data } = await supabase.storage.from("receipts").createSignedUrl(receipt.storage_path, 600)
    if (data?.signedUrl) signedUrls.set(receipt.id, data.signedUrl)
  }))

  return participants.map(participant => {
    const receipt = latestByParticipant.get(participant.id)
    return {
      ...participant,
      receipt_id: receipt?.id || null,
      receipt_event_id: receipt?.event_id || null,
      receipt_url: receipt ? signedUrls.get(receipt.id) || null : null,
      receipt_received_at: receipt?.received_at || null,
      receipt_approved: receipt?.status === "approved",
      receipt_approved_at: receipt?.status === "approved" ? receipt.reviewed_at : null,
      receipt_rejected: receipt?.status === "rejected",
      receipt_rejected_at: receipt?.status === "rejected" ? receipt.reviewed_at : null,
      receipt_rejection_reason: receipt?.rejection_reason || null,
    }
  })
}

const PARTICIPANT_SELECT = "id,assigned_number,name,phone_number,secure_token,event_id,survey_data,preferred_age_min,preferred_age_max,attendance_confirmed,attendance_confirmed_at,attendance_denied_at,PAID,PAID_DONE,payment_waived,receipt_url,receipt_received_at,receipt_approved,receipt_rejected,same_gender_preference,any_gender_preference,age_flex_years,age_flex_event_id,arrival_status,arrival_status_at,discount_interest,auto_signup_next_event,last_twilio_action,last_twilio_action_at"

async function participantPage({ eventId, cursor = 0, search = "", filter = "all", limit = 40 } = {}) {
  const pageSize = Math.min(Math.max(Number(limit) || 40, 10), 50)
  let query = supabase.from("participants").select(PARTICIPANT_SELECT)
    .eq("match_id", STATIC_MATCH_ID).neq("assigned_number", 9999)
    .gt("assigned_number", Math.max(Number(cursor) || 0, 0))

  if (filter === "confirmed") query = query.eq("attendance_confirmed", true)
  if (filter === "awaiting_payment") query = query.eq("attendance_confirmed", true).eq("PAID_DONE", false).eq("payment_waived", false)
  if (filter === "declined") query = query.not("attendance_denied_at", "is", null)
  if (["on_way", "late", "arrived"].includes(filter)) query = query.eq("arrival_status", filter)

  const term = String(search || "").trim().replace(/[,%()]/g, " ").slice(0, 80)
  if (term) {
    const number = /^\d+$/.test(term) ? Number(term) : null
    const clauses = [`name.ilike.%${term}%`, `phone_number.ilike.%${term}%`]
    if (number !== null) clauses.push(`assigned_number.eq.${number}`)
    query = query.or(clauses.join(","))
  }

  const { data, error } = await query.order("assigned_number").limit(pageSize + 1)
  if (error) throw error
  const rows = data || []
  const hasMore = rows.length > pageSize
  const visible = rows.slice(0, pageSize)
  const participants = await attachEventReceipts(visible, eventId)
  return { participants, hasMore, nextCursor: hasMore ? visible.at(-1)?.assigned_number || null : null, pageSize }
}

async function whatsappConfig() {
  const { data } = await supabase.from("event_state").select("whatsapp_config").eq("match_id", STATIC_MATCH_ID).maybeSingle()
  const config = {
    earlyPrice: 60,
    latePrice: 75,
    latePriceSwitchLabel: "الموعد المحدد",
    stcPay: "0560899666",
    bankName: "مصرف الراجحي: عبدالرحمن عبدالملك",
    iban: "SA2480000588608016007502",
    eventDateText: "",
    eventTimeText: "",
    arrivalTimeText: "",
    locationName: "",
    mapUrl: "",
    matchExperienceText: "تجربة اجتماعية منظمة مبنية على التوافق.",
    discountPrice: 50,
    discountDeadline: "نهاية اليوم",
    eventName: "التوافق الأعمى 4.0",
    ...(data?.whatsapp_config || {}),
  }
  return { ...config, latePriceSwitchLabel: formatRiyadhCutoffLabel(config.paymentCutoffLocal) || config.latePriceSwitchLabel }
}

async function feedbackRemaining(assignedNumber) {
  const { data } = await supabase
    .from("event3_matches")
    .select("phase2_partner,phase3_partner,phase2_feedback,phase3_feedback")
    .eq("match_id", EVENT3_MATCH_ID)
    .eq("participant_number", assignedNumber)
  return (data || []).reduce((count, row) => count
    + (row.phase2_partner && !row.phase2_feedback ? 1 : 0)
    + (row.phase3_partner && !row.phase3_feedback ? 1 : 0), 0)
}

async function buildVariables(templateKey, participant, overrides = {}) {
  const config = await whatsappConfig()
  const name = participant.name || participant.survey_data?.answers?.name || participant.survey_data?.name || `المشارك #${participant.assigned_number}`
  const minAge = participant.preferred_age_min ?? participant.survey_data?.answers?.preferred_age_min ?? "غير محدد"
  const maxAge = participant.preferred_age_max ?? participant.survey_data?.answers?.preferred_age_max ?? "غير محدد"
  let values = {}
  if (templateKey === "match") values = {
    // {{1}} and {{2}} are used by the template's actions; the message body begins at {{3}}.
    1: participant.assigned_number,
    2: participant.secure_token,
    3: config.eventDateText || "TBD",
    4: config.eventTimeText || "TBD",
    5: config.arrivalTimeText || "TBD",
    6: config.locationName || "TBD",
    7: config.mapUrl || "https://maps.google.com",
  }
  if (templateKey === "reminder") values = { 1: name, 2: config.eventDateText, 3: config.eventTimeText, 4: config.locationName, 5: config.mapUrl }
  if (templateKey === "payment") values = {
    1: name, 2: config.earlyPrice, 3: config.latePriceSwitchLabel, 4: config.latePrice,
    5: config.stcPay, 6: config.bankName, 7: config.iban,
  }
  if (templateKey === "gender_preference") values = { 1: name }
  if (templateKey === "age_flexibility") values = { 1: name, 2: minAge, 3: maxAge }
  if (templateKey === "discount") values = { 1: name, 2: config.discountPrice, 3: config.discountDeadline }
  if (templateKey === "late_check") values = { 1: name }
  if (templateKey === "match_cancellation") values = { 1: name }
  if (templateKey === "feedback_remaining") values = {
    1: name, 2: await feedbackRemaining(participant.assigned_number), 3: config.eventName, 4: participant.secure_token,
  }
  return { ...values, ...overrides }
}

async function sendApprovedTemplate(template, participant, overrides = {}) {
  const sid = template.content_sid || templateEnvSid(template.template_key)
  if (!sid) throw new Error("Template SID is missing")
  if (!template.enabled) throw new Error("Template is disabled")
  if (template.approval_status !== "approved") throw new Error(`Template is ${template.approval_status}; WhatsApp approval is required`)
  if (!participant.phone_number) throw new Error("Participant has no phone number")
  if (template.template_key === "payment" && participant.payment_reminder_sent === true) {
    return { skipped: true, reason: "Payment reminder already sent" }
  }
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const sender = process.env.TWILIO_WHATSAPP_SENDER || "whatsapp:+13527387477"
  if (!accountSid || !authToken) throw new Error("Twilio credentials not configured")
  const contentVariables = await buildVariables(template.template_key, participant, overrides)
  if (template.template_key === "feedback_remaining" && Number(contentVariables[2] || 0) < 1) {
    return { skipped: true, reason: "No feedback remaining", variables: contentVariables }
  }
  const body = new URLSearchParams({
    From: sender,
    To: normalizeWhatsapp(participant.phone_number),
    ContentSid: sid,
    ContentVariables: JSON.stringify(contentVariables),
    StatusCallback: STATUS_CALLBACK_URL,
  })
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  })
  const twilio = await response.json()
  await supabase.from("whatsapp_messages").insert({
    participant_id: participant.id,
    assigned_number: participant.assigned_number,
    phone_number: normalizeWhatsapp(participant.phone_number),
    direction: "outbound",
    template_sid: sid,
    template_variables: contentVariables,
    twilio_message_sid: twilio.sid || null,
    status: response.ok ? (twilio.status || "queued") : "failed",
    status_updated_at: new Date().toISOString(),
    error_code: twilio.code ? String(twilio.code) : null,
    error_message: response.ok ? null : (twilio.message || `Twilio ${response.status}`),
    twilio_payload: twilio ? { sid: twilio.sid || null, status: twilio.status || null, code: twilio.code || null } : null,
  })
  if (!response.ok) throw new Error(twilio.message || "Twilio send failed")
  if (template.template_key !== "reminder") {
    const { error: sentFlagError } = await supabase
      .from("participants")
      .update(template.template_key === "payment" ? { payment_reminder_sent: true } : { PAID: true })
      .eq("id", participant.id)
    if (sentFlagError) console.error("Failed to mark participant as WhatsApp sent:", sentFlagError)
  }
  return { success: true, sid: twilio.sid, status: twilio.status || "queued", variables: contentVariables }
}

async function recordAction(participant, eventId, actionKey, actionValue, source = "admin", note = null) {
  const now = new Date().toISOString()
  const { error } = await supabase.from("participant_twilio_actions").upsert({
    participant_id: participant.id,
    assigned_number: participant.assigned_number,
    event_id: eventId,
    action_key: actionKey,
    action_value: actionValue || {},
    source,
    note,
    updated_at: now,
  }, { onConflict: "participant_id,event_id,action_key" })
  if (error) throw error
  await supabase.from("participants").update({ last_twilio_action: actionKey, last_twilio_action_at: now }).eq("id", participant.id)
}

async function updateParticipantAction(participant, actionKey, value, eventId) {
  const now = new Date().toISOString()
  let update = {}
  if (actionKey === "attendance") {
    if (value === "confirmed") {
      update = { attendance_confirmed: true, attendance_confirmed_at: now, attendance_denied_at: null }
      const { data: approvedReceipt } = await supabase
        .from("participant_receipts")
        .select("id")
        .eq("participant_id", participant.id)
        .eq("event_id", eventId)
        .eq("status", "approved")
        .limit(1)
        .maybeSingle()
      if (approvedReceipt) Object.assign(update, { PAID_DONE: true, payment_waived: false })
    }
    if (value === "declined") update = { attendance_confirmed: false, attendance_confirmed_at: null, attendance_denied_at: now, PAID_DONE: false, payment_waived: false }
    if (value === "pending") update = { attendance_confirmed: false, attendance_confirmed_at: null, attendance_denied_at: null, PAID_DONE: false, payment_waived: false }
  } else if (actionKey === "payment") {
    if (value === "paid") update = { PAID: true, PAID_DONE: true, payment_waived: false, receipt_approved: true, receipt_approved_at: now, receipt_rejected: false, receipt_rejected_at: null }
    if (value === "unpaid") update = { PAID: false, PAID_DONE: false, payment_waived: false, receipt_approved: false, receipt_approved_at: null }
    if (value === "waived") update = { PAID: false, PAID_DONE: false, payment_waived: true, receipt_approved: false, receipt_approved_at: null }
  } else if (actionKey === "gender_preference") {
    if (value === "any") update = { any_gender_preference: true, same_gender_preference: false }
    if (value === "same") update = { any_gender_preference: false, same_gender_preference: true }
    if (value === "different") update = { any_gender_preference: false, same_gender_preference: false }
  } else if (actionKey === "age_flexibility") {
    update = { age_flex_years: Number(value) || 0, age_flex_event_id: Number(value) ? eventId : null }
  } else if (actionKey === "arrival") {
    update = { arrival_status: value === "none" ? null : value, arrival_status_at: value === "none" ? null : now }
    if (value === "cancelled") Object.assign(update, { attendance_confirmed: false, attendance_confirmed_at: null, attendance_denied_at: now })
  } else if (actionKey === "discount") {
    update = { discount_interest: value === "none" ? null : value }
  } else if (actionKey === "auto_signup") {
    update = { auto_signup_next_event: value === "enabled" }
  } else {
    throw new Error(`Unsupported participant action: ${actionKey}`)
  }
  const { error } = await supabase.from("participants").update({ ...update, last_twilio_action: actionKey, last_twilio_action_at: now }).eq("id", participant.id)
  if (error) throw error
  await recordAction(participant, eventId, actionKey, { value }, "admin")
}

async function dashboard() {
  const eventId = await currentEventId()
  const [templatesResult, responsesResult, messagesResult, actionsResult, attendanceResult, page, totalResult, confirmedResult, declinedResult, paidResult, awaitingResult, receiptsResult, onWayResult, lateResult, arrivedResult] = await Promise.all([
    supabase.from("twilio_templates").select("*").order("sort_order"),
    supabase.from("twilio_response_rules").select("*").order("sort_order"),
    supabase.from("whatsapp_messages").select("id,assigned_number,phone_number,direction,message_body,template_sid,button_text,twilio_message_sid,status,status_updated_at,error_code,error_message,created_at").order("created_at", { ascending: false }).limit(100),
    supabase.from("participant_twilio_actions").select("id,assigned_number,action_key,action_value,source,updated_at").eq("event_id", eventId).order("updated_at", { ascending: false }).limit(200),
    supabase.from("attendance_requests").select("*").eq("status", "pending").order("created_at", { ascending: false }),
    participantPage({ eventId }),
    supabase.from("participants").select("id", { count: "exact", head: true }).eq("match_id", STATIC_MATCH_ID).neq("assigned_number", 9999),
    supabase.from("participants").select("id", { count: "exact", head: true }).eq("match_id", STATIC_MATCH_ID).eq("attendance_confirmed", true).neq("assigned_number", 9999),
    supabase.from("participants").select("id", { count: "exact", head: true }).eq("match_id", STATIC_MATCH_ID).not("attendance_denied_at", "is", null).neq("assigned_number", 9999),
    supabase.from("participants").select("id", { count: "exact", head: true }).eq("match_id", STATIC_MATCH_ID).eq("attendance_confirmed", true).or("PAID_DONE.eq.true,payment_waived.eq.true").neq("assigned_number", 9999),
    supabase.from("participants").select("id", { count: "exact", head: true }).eq("match_id", STATIC_MATCH_ID).eq("attendance_confirmed", true).eq("PAID_DONE", false).eq("payment_waived", false).neq("assigned_number", 9999),
    supabase.from("participant_receipts").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("status", "pending"),
    supabase.from("participants").select("id", { count: "exact", head: true }).eq("match_id", STATIC_MATCH_ID).eq("arrival_status", "on_way").neq("assigned_number", 9999),
    supabase.from("participants").select("id", { count: "exact", head: true }).eq("match_id", STATIC_MATCH_ID).eq("arrival_status", "late").neq("assigned_number", 9999),
    supabase.from("participants").select("id", { count: "exact", head: true }).eq("match_id", STATIC_MATCH_ID).eq("arrival_status", "arrived").neq("assigned_number", 9999),
  ])
  for (const result of [templatesResult, responsesResult, messagesResult, actionsResult, attendanceResult, totalResult, confirmedResult, declinedResult, paidResult, awaitingResult, receiptsResult, onWayResult, lateResult, arrivedResult]) {
    if (result.error) throw result.error
  }
  const templates = (templatesResult.data || []).map(t => ({ ...t, content_sid: t.content_sid || templateEnvSid(t.template_key) }))
  const messages = messagesResult.data || []
  const { data: pendingReceiptRows, error: pendingReceiptError } = await supabase
    .from("participant_receipts")
    .select("id,participant_id,assigned_number,event_id,storage_path,received_at")
    .eq("event_id", eventId).eq("status", "pending")
    .order("received_at", { ascending: false }).limit(100)
  if (pendingReceiptError) throw pendingReceiptError
  let receiptApprovals = []
  if (pendingReceiptRows?.length) {
    const { data: receiptParticipants, error: receiptParticipantsError } = await supabase
      .from("participants").select("id,name,phone_number,survey_data")
      .in("id", pendingReceiptRows.map(row => row.participant_id))
    if (receiptParticipantsError) throw receiptParticipantsError
    const participantById = new Map((receiptParticipants || []).map(participant => [participant.id, participant]))
    const signed = new Map()
    await Promise.all(pendingReceiptRows.map(async row => {
      if (!row.storage_path) return
      const { data } = await supabase.storage.from("receipts").createSignedUrl(row.storage_path, 600)
      if (data?.signedUrl) signed.set(row.id, data.signedUrl)
    }))
    receiptApprovals = pendingReceiptRows.map(row => ({
      ...(participantById.get(row.participant_id) || {}),
      receipt_id: row.id,
      receipt_event_id: row.event_id,
      assigned_number: row.assigned_number,
      receipt_url: signed.get(row.id) || null,
      receipt_received_at: row.received_at,
    }))
  }
  const delivery = ["queued", "sent", "delivered", "read", "failed", "undelivered"].reduce((acc, status) => {
    acc[status] = messages.filter(m => m.direction === "outbound" && m.status === status).length
    return acc
  }, {})
  return {
    success: true,
    eventId,
    templates,
    responses: responsesResult.data || [],
    messages,
    actions: actionsResult.data || [],
    participants: page.participants,
    participantPage: { hasMore: page.hasMore, nextCursor: page.nextCursor, pageSize: page.pageSize },
    attendanceRequests: attendanceResult.data || [],
    receiptApprovals,
    delivery,
    stats: {
      participants: totalResult.count || 0,
      confirmed: confirmedResult.count || 0,
      declined: declinedResult.count || 0,
      paid: paidResult.count || 0,
      awaitingReceipt: awaitingResult.count || 0,
      receiptsPending: receiptsResult.count || 0,
      onWay: onWayResult.count || 0,
      late: lateResult.count || 0,
      arrived: arrivedResult.count || 0,
    },
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })
  if (!enforceRateLimit(req, res, { key: "twilio-console", limit: 90, windowMs: 60_000 })) return
  if (!await requireAdmin(req, res, { action: `twilio-${req.body?.action || "request"}` })) return
  const { action } = req.body || {}
  try {
    if (action === "dashboard") return res.status(200).json(await dashboard())
    if (action === "participant-page") {
      const eventId = Number(req.body.event_id || await currentEventId())
      return res.status(200).json({ success: true, ...(await participantPage({ eventId, cursor: req.body.cursor, search: req.body.search, filter: req.body.filter, limit: req.body.limit })) })
    }

    if (action === "update-template") {
      const { id, patch } = req.body
      const allowed = ["friendly_name", "description", "content_sid", "category", "language", "content_type", "approval_status", "rejection_reason", "body_text", "variables", "buttons", "enabled"]
      const update = Object.fromEntries(Object.entries(patch || {}).filter(([key]) => allowed.includes(key)))
      update.updated_at = new Date().toISOString()
      const { data, error } = await supabase.from("twilio_templates").update(update).eq("id", id).select().single()
      if (error) throw error
      return res.status(200).json({ success: true, template: data })
    }

    if (action === "update-response") {
      const { id, response_text, enabled } = req.body
      const { data, error } = await supabase.from("twilio_response_rules").update({ response_text, enabled, updated_at: new Date().toISOString() }).eq("id", id).select().single()
      if (error) throw error
      return res.status(200).json({ success: true, response: data })
    }

    if (action === "sync-approvals") {
      const accountSid = process.env.TWILIO_ACCOUNT_SID
      const authToken = process.env.TWILIO_AUTH_TOKEN
      if (!accountSid || !authToken) return res.status(500).json({ error: "Twilio credentials not configured" })
      const { data: templates, error } = await supabase.from("twilio_templates").select("*")
      if (error) throw error
      const results = []
      for (const template of templates || []) {
        const sid = template.content_sid || templateEnvSid(template.template_key)
        if (!sid) {
          results.push({ key: template.template_key, success: false, error: "Content SID is missing" })
          continue
        }
        const response = await fetch(`https://content.twilio.com/v1/Content/${sid}/ApprovalRequests`, {
          headers: { Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64") },
        })
        const data = await response.json()
        if (response.ok) {
          const approval = data.whatsapp || {}
          const status = String(approval.status || "unsubmitted").toLowerCase()
          await supabase.from("twilio_templates").update({
            content_sid: sid,
            approval_status: status,
            category: approval.category || template.category,
            rejection_reason: approval.rejection_reason || null,
            last_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", template.id)
          results.push({ key: template.template_key, success: true, status })
        } else {
          results.push({ key: template.template_key, success: false, error: data.message || `Twilio ${response.status}` })
        }
      }
      return res.status(200).json({ success: true, results })
    }

    if (action === "sync-delivery-statuses") {
      const accountSid = process.env.TWILIO_ACCOUNT_SID
      const authToken = process.env.TWILIO_AUTH_TOKEN
      if (!accountSid || !authToken) return res.status(500).json({ error: "Twilio credentials not configured" })
      const { data: messages, error } = await supabase
        .from("whatsapp_messages")
        .select("id,twilio_message_sid,status")
        .eq("direction", "outbound")
        .in("status", ["queued", "sent"])
        .not("twilio_message_sid", "is", null)
        .order("created_at", { ascending: false })
        .limit(100)
      if (error) throw error

      const results = []
      for (let index = 0; index < (messages || []).length; index += 5) {
        const batch = await Promise.all(messages.slice(index, index + 5).map(async message => {
          const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages/${message.twilio_message_sid}.json`, {
            headers: { Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64") },
          })
          const twilio = await response.json()
          if (!response.ok) return { id: message.id, success: false, error: twilio.message || `Twilio ${response.status}` }
          const status = String(twilio.status || message.status).toLowerCase()
          const now = new Date().toISOString()
          const patch = {
            status,
            status_updated_at: now,
            error_code: twilio.error_code ? String(twilio.error_code) : null,
            error_message: twilio.error_message || null,
            twilio_payload: twilio ? { sid: twilio.sid || null, status: twilio.status || null, code: twilio.code || null } : null,
          }
          if (status === "delivered") patch.delivered_at = twilio.date_updated || now
          if (status === "read") {
            patch.read_at = twilio.date_updated || now
            patch.delivered_at = twilio.date_updated || now
          }
          if (status === "failed" || status === "undelivered") patch.failed_at = twilio.date_updated || now
          const { error: updateError } = await supabase.from("whatsapp_messages").update(patch).eq("id", message.id)
          return updateError
            ? { id: message.id, success: false, error: updateError.message }
            : { id: message.id, success: true, status }
        }))
        results.push(...batch)
      }
      return res.status(200).json({
        success: true,
        checked: results.length,
        updated: results.filter(result => result.success).length,
        failed: results.filter(result => !result.success).length,
      })
    }

    if (action === "set-participant-action") {
      const { assigned_number, action_key, value } = req.body
      const eventId = Number(req.body.event_id || await currentEventId())
      const { data: participant, error } = await supabase.from("participants").select("*").eq("match_id", STATIC_MATCH_ID).eq("assigned_number", assigned_number).single()
      if (error || !participant) return res.status(404).json({ error: "Participant not found" })
      await updateParticipantAction(participant, action_key, value, eventId)
      return res.status(200).json({ success: true })
    }

    if (action === "send-template") {
      const { assigned_number, template_key, variables = {} } = req.body
      const [{ data: participant, error: participantError }, { data: template, error: templateError }] = await Promise.all([
        supabase.from("participants").select("*").eq("match_id", STATIC_MATCH_ID).eq("assigned_number", assigned_number).single(),
        supabase.from("twilio_templates").select("*").eq("template_key", template_key).single(),
      ])
      if (participantError || !participant) return res.status(404).json({ error: "Participant not found" })
      if (templateError || !template) return res.status(404).json({ error: "Template not found" })
      const result = await sendApprovedTemplate(template, participant, variables)
      return res.status(200).json(result)
    }

    if (action === "bulk-send-template") {
      const { participant_numbers, template_key } = req.body
      if (!Array.isArray(participant_numbers) || participant_numbers.length < 1) return res.status(400).json({ error: "Select at least one participant" })
      if (participant_numbers.length > 500) return res.status(400).json({ error: "A bulk send is limited to 500 participants" })
      const uniqueParticipantNumbers = [...new Set(participant_numbers)]
      const [{ data: template, error: templateError }, { data: participants, error: participantsError }] = await Promise.all([
        supabase.from("twilio_templates").select("*").eq("template_key", template_key).single(),
        supabase.from("participants").select("*").eq("match_id", STATIC_MATCH_ID).in("assigned_number", uniqueParticipantNumbers),
      ])
      if (templateError || !template) return res.status(404).json({ error: "Template not found" })
      if (participantsError) throw participantsError
      const foundNumbers = new Set((participants || []).map(participant => participant.assigned_number))
      const results = uniqueParticipantNumbers
        .filter(number => !foundNumbers.has(number))
        .map(number => ({ assigned_number: number, success: false, error: "Participant not found" }))
      const alreadySent = (participants || []).filter(participant => template_key === "payment"
        ? participant.payment_reminder_sent === true
        : template_key === "reminder"
          ? false
          : participant.PAID === true)
      results.push(...alreadySent.map(participant => ({
        assigned_number: participant.assigned_number,
        success: true,
        skipped: true,
        reason: template_key === "payment" ? "Payment reminder already sent" : "Already marked WhatsApp sent",
      })))
      const participantBatches = (participants || []).filter(participant => template_key === "payment"
        ? participant.payment_reminder_sent !== true
        : template_key === "reminder"
          ? true
          : participant.PAID !== true)
      // Small concurrent batches keep event-day sends responsive without flooding
      // Twilio or exhausting the serverless function's connection pool.
      for (let index = 0; index < participantBatches.length; index += 5) {
        const batchResults = await Promise.all(participantBatches.slice(index, index + 5).map(async participant => {
          try {
            const result = await sendApprovedTemplate(template, participant)
            return { assigned_number: participant.assigned_number, ...result }
          } catch (error) {
            return { assigned_number: participant.assigned_number, success: false, error: error?.message || "Send failed" }
          }
        }))
        results.push(...batchResults)
      }
      return res.status(200).json({
        success: true,
        sent: results.filter(r => r.success).length,
        skipped: results.filter(r => r.skipped).length,
        failed: results.filter(r => r.success === false).length,
        results,
      })
    }

    return res.status(400).json({ error: "Unknown action" })
  } catch (error) {
    console.error("twilio-console error:", error)
    return res.status(500).json({ error: error?.message || "Twilio console request failed" })
  }
}
