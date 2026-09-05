import OpenAI from "openai"
import {
  canAccessEvent3DuringTest,
  isEvent3TestImpersonation,
} from "../server/event3/test-access.mjs"
import { buildWelcomePrompt } from "./admin/ai-welcome-prompt.mjs"
import { supabaseAdmin } from "../server/security/supabase-admin.mjs"
import { enforceRateLimit } from "../server/security/request-security.mjs"
import { protectPartnerPrivacy } from "../server/participants/result-privacy.mjs"
import {
  MATCH_INSIGHTS_VERSION,
  buildVibeDescription,
  validateMatchInsights,
} from "../server/matching/match-insights.mjs"
import {
  BALANCED_COMPATIBILITY_VERSION,
  OPPOSITES_COMPATIBILITY_VERSION,
  BALANCED_VIBE_MAX,
  BALANCED_VIBE_MODEL,
  BALANCED_VIBE_VERSION,
  BALANCED_VIBE_MODEL_TAG,
  buildBalancedCacheIdentity,
  getBalancedCacheBreakdown,
  isCurrentOppositesScoreSnapshot,
} from "../server/matching/balanced-compatibility.mjs"
import { isEvent3SignedUp } from "../server/event3/enrollment.mjs"
import { normalizeGroupMemberFeedback } from "../server/event3/group-member-feedback.mjs"
import { getEvent3PhaseTimerSeconds } from "../server/event3/timing.mjs"
import {
  sendAuthenticaOtp,
  verifyAuthenticaOtp,
} from "../server/auth/authentica-otp.mjs"
import {
  event3GroupRoundCount,
  isChoiceOnlyEvent3,
  loadEvent3Format,
} from "../server/event3/event-format.mjs"
import {
  buildEvent3MutualContactShare,
  normalizeEvent3FeedbackPayload,
  normalizeEvent3MemoryWord,
} from "../app/lib/event3-contact-sharing.mjs"
import {
  isPlausibleParticipantPhone,
  normalizeParticipantPhone,
  participantPhoneToE164,
  shouldCheckParticipantPhoneOwnership,
} from "../server/participants/phone-normalization.mjs"
import { validateProfileDataCollection } from "../server/participants/profile-data-collection.mjs"
import {
  buildSurveyProgressPresenceRow,
  isSurveyProgressSchemaMissing,
  normalizeSurveyProgressHeartbeat,
} from "../server/participants/survey-progress.mjs"
import {
  LEGAL_ACCEPTED_DOCUMENT_VERSIONS,
  LEGAL_DOCUMENT_VERSION,
  LEGAL_PRIVACY_NOTICE_VERSION,
  LEGAL_TERMS_VERSION,
  buildLegalAcceptanceRow,
  hasCurrentLegalAcceptance,
  isAcceptedLegalBundle,
  shouldRequireLegalAcceptance,
} from "../server/participants/legal-acceptance.mjs"

// In-memory cache for e3 token resolution (5 min TTL) to reduce Supabase API load
const _e3TokenCache = new Map() // token -> { participant, expiresAt }
const E3_TOKEN_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

const EVENT3_POST_GROUP_PHASES = new Set([
  "phase2_processing", "break", "phase2_reveal", "phase3_processing", "phase3_reveal",
  "phase4_processing", "phase4_reveal", "final", "final_reveal",
])
const EVENT3_FIRST_MATCH_REVEAL_PHASES = new Set([
  "phase2_reveal", "phase3_processing", "phase3_reveal", "phase4_processing", "phase4_reveal", "final", "final_reveal",
])
const EVENT3_SECOND_MATCH_REVEAL_PHASES = new Set([
  "phase3_reveal", "phase4_processing", "phase4_reveal", "final", "final_reveal",
])
const EVENT3_THIRD_MATCH_REVEAL_PHASES = new Set(["phase4_reveal", "final", "final_reveal"])

function event3ReachedGroupRounds(phase, maximumRounds) {
  const phaseRound = Number(String(phase || "").match(/^(?:round|ranking)([123])$/)?.[1] || 0)
  if (phaseRound > 0) return Math.min(phaseRound, maximumRounds)
  return EVENT3_POST_GROUP_PHASES.has(String(phase || "")) ? maximumRounds : 0
}

// Add better error logging
const logError = (context, error) => {
  console.error(`❌ ${context}:`, {
    message: error.message,
    code: error.code,
    details: error.details,
    hint: error.hint,
    stack: error.stack
  })
}

const supabase = supabaseAdmin
const STATIC_MATCH_ID = "00000000-0000-0000-0000-000000000000"

function parseJsonObject(value) {
  if (!value) return null
  if (typeof value === "object" && !Array.isArray(value)) return value
  if (typeof value !== "string") return null
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function withParticipantBreakdownAliases(cacheRow) {
  const storedBreakdown = parseJsonObject(cacheRow?.score_breakdown)
  const breakdown = storedBreakdown || getBalancedCacheBreakdown(cacheRow)
  const total = Number(cacheRow?.total_compatibility_score ?? breakdown?.total ?? 0)
  return {
    ...breakdown,
    total: Number.isFinite(total) ? total : 0,
    scoreModelVersion: BALANCED_COMPATIBILITY_VERSION,
    score_model_version: BALANCED_COMPATIBILITY_VERSION,
    scoreMaximum: 100,
    vibeMaximum: BALANCED_VIBE_MAX,
    questionScores: parseJsonObject(cacheRow?.question_scores),
    vibeAxes: parseJsonObject(cacheRow?.vibe_axes),
    vibeModelVersion: cacheRow?.vibe_model_version ?? null,
    // Retain the participant UI's established keys while exposing the balanced
    // semantic component names returned by getBalancedCacheBreakdown.
    synergy: Number(breakdown?.interactionRhythm ?? 0),
    vibe: Number(breakdown?.aiSemantic ?? 0),
    lifestyle: Number(breakdown?.lifestyleSustainability ?? 0),
    humorOpen: Number(breakdown?.humorOpenness ?? 0),
    communication: Number(breakdown?.communicationDisagreement ?? 0),
    coreValues: Number(
      breakdown?.valuesBoundariesLanguage
      ?? ((breakdown?.valuesBoundaries ?? 0) + (breakdown?.language ?? 0)),
    ),
    intent: Number(breakdown?.intent ?? 0),
  }
}

function participantBreakdownFromScoreSnapshot(snapshotValue, {
  scoreModelVersion: persistedScoreModelVersion,
  scoreContentHash: persistedScoreContentHash,
  storedTotal,
} = {}) {
  const snapshot = parseJsonObject(snapshotValue)
  if (!snapshot) return null

  const scoreModelVersion = String(snapshot.scoreModelVersion ?? snapshot.score_model_version ?? "")
  const snapshotContentHash = String(snapshot.combinedContentHash ?? snapshot.combined_content_hash ?? "")
  const rowScoreModelVersion = String(persistedScoreModelVersion ?? "")
  const rowScoreContentHash = String(persistedScoreContentHash ?? "")
  const snapshotTotal = Number(snapshot.totalScore ?? snapshot.total_score)
  const rowTotal = Number(storedTotal)
  if (
    !rowScoreModelVersion
    || !rowScoreContentHash
    || scoreModelVersion !== rowScoreModelVersion
    || snapshotContentHash !== rowScoreContentHash
    || !Number.isFinite(snapshotTotal)
    || !Number.isFinite(rowTotal)
    || snapshotTotal !== rowTotal
  ) return null

  const scoreBreakdown = parseJsonObject(snapshot.scoreBreakdown ?? snapshot.score_breakdown)
  if (!scoreBreakdown) return null

  const total = snapshotTotal
  const isBalanced = scoreModelVersion === BALANCED_COMPATIBILITY_VERSION
  if (!isBalanced) {
    if (scoreModelVersion === OPPOSITES_COMPATIBILITY_VERSION && !isCurrentOppositesScoreSnapshot({
      modelVersion: rowScoreModelVersion,
      contentHash: rowScoreContentHash,
      snapshot,
      persistedTotal: storedTotal,
    })) return null
    // Historical snapshots from a different model remain explicitly versioned.
    // Their raw keys are preserved instead of being relabelled as current-model
    // components with today's maxima.
    return {
      ...scoreBreakdown,
      total: Number.isFinite(total) ? total : null,
      scoreModelVersion: scoreModelVersion || null,
      score_model_version: scoreModelVersion || null,
      scoreMaximum: Number(snapshot.scoreMaximum ?? snapshot.score_maximum ?? 100),
      legacy: true,
    }
  }

  const questionScores = parseJsonObject(snapshot.questionScores ?? snapshot.question_scores)
  const vibeAxes = parseJsonObject(snapshot.vibeAxes ?? snapshot.vibe_axes)
  if (
    !questionScores
    || !vibeAxes
    || snapshot.vibeModel !== BALANCED_VIBE_MODEL
    || snapshot.vibeModelVersion !== BALANCED_VIBE_VERSION
    || snapshot.vibeModelTag !== BALANCED_VIBE_MODEL_TAG
  ) return null

  const valuesBoundariesLanguage = Number(
    scoreBreakdown.valuesBoundariesLanguage
    ?? ((scoreBreakdown.valuesBoundaries ?? 0) + (scoreBreakdown.language ?? 0)),
  )
  return {
    ...scoreBreakdown,
    total: Number.isFinite(total) ? total : 0,
    scoreModelVersion,
    score_model_version: scoreModelVersion,
    scoreMaximum: Number(snapshot.scoreMaximum ?? snapshot.score_maximum ?? 100),
    vibeMaximum: Number(snapshot.vibeMaximum ?? snapshot.vibe_maximum ?? BALANCED_VIBE_MAX),
    vibeModelVersion: snapshot.vibeModelVersion ?? snapshot.vibe_model_version ?? null,
    questionScores,
    vibeAxes,
    synergy: Number(scoreBreakdown.interactionRhythm ?? 0),
    vibe: Number(scoreBreakdown.aiSemantic ?? 0),
    lifestyle: Number(scoreBreakdown.lifestyleSustainability ?? 0),
    humorOpen: Number(scoreBreakdown.humorOpenness ?? 0),
    communication: Number(scoreBreakdown.communicationDisagreement ?? 0),
    coreValues: valuesBoundariesLanguage,
    valuesBoundariesLanguage,
    intent: Number(scoreBreakdown.intent ?? 0),
  }
}

function formatParticipantBreakdownReason(breakdown) {
  if (!breakdown) return ""
  if (breakdown.scoreModelVersion !== BALANCED_COMPATIBILITY_VERSION) {
    return breakdown.scoreModelVersion
      ? `Historical score model: ${breakdown.scoreModelVersion}`
      : "Historical score model"
  }
  const value = key => Number(breakdown?.[key] ?? 0)
  const personalized = breakdown.personalized || {}
  const base = Number(personalized.totalScore ?? breakdown.personalizedBase ?? 0)
  const adjustment = Number(breakdown.aiChemistryAdjustment ?? 0)
  const finalScore = Number(breakdown.finalScore ?? breakdown.total ?? 0)
  const chemistry = breakdown.aiChemistryReady === true
    ? `${adjustment >= 0 ? "+" : ""}${adjustment}`
    : "pending"
  const diagnostics = [
    `Common Ground: ${value("semanticCommonGround")}/18`,
    `Interaction: ${value("interactionRhythm")}/20`,
    `Humor/Openness: ${value("humorOpenness")}/10`,
    `Attachment: ${value("attachmentComfort")}/8`,
    `Lifestyle: ${value("lifestyleSustainability")}/12`,
    `Values/Language: ${value("valuesBoundariesLanguage")}/17`,
    `Communication/Disagreement: ${value("communicationDisagreement")}/10`,
    `Intent: ${value("intent")}/5`,
  ].join(" + ")
  return `Archetype base: ${base}% + AI chemistry: ${chemistry} = ${finalScore}% | Diagnostics: ${diagnostics}`
}

async function fetchParticipantBalancedCacheBreakdown(participantA, participantB) {
  const [smaller, larger] = [Number(participantA), Number(participantB)].sort((a, b) => a - b)
  if (!Number.isFinite(smaller) || !Number.isFinite(larger) || smaller === larger) return null

  const { data: participantRows, error: participantError } = await supabase
    .from("participants")
    .select("*")
    .eq("match_id", process.env.CURRENT_MATCH_ID || STATIC_MATCH_ID)
    .in("assigned_number", [smaller, larger])

  if (participantError || !Array.isArray(participantRows) || participantRows.length !== 2) {
    if (participantError) console.error("Could not load participant profiles for compatibility cache identity:", participantError)
    return null
  }

  const byNumber = new Map(participantRows.map(row => [Number(row.assigned_number), row]))
  const smallerProfile = byNumber.get(smaller)
  const largerProfile = byNumber.get(larger)
  if (!smallerProfile || !largerProfile) return null
  const identity = buildBalancedCacheIdentity(smallerProfile, largerProfile)

  const { data: cacheRow, error } = await supabase
    .from("compatibility_cache")
    .select("*")
    .eq("participant_a_number", smaller)
    .eq("participant_b_number", larger)
    .eq("combined_content_hash", identity.combinedContentHash)
    .eq("vibe_content_hash", identity.vibeContentHash)
    .eq("score_model_version", BALANCED_COMPATIBILITY_VERSION)
    .like("model_used", `${BALANCED_VIBE_MODEL_TAG}%`)
    .maybeSingle()

  if (error) {
    console.error("Could not load balanced compatibility breakdown:", error)
    return null
  }
  if (
    !cacheRow
    || cacheRow.combined_content_hash !== identity.combinedContentHash
    || cacheRow.vibe_content_hash !== identity.vibeContentHash
    || cacheRow.score_model_version !== BALANCED_COMPATIBILITY_VERSION
    || !(
      String(cacheRow.model_used ?? "") === BALANCED_VIBE_MODEL_TAG
      || String(cacheRow.model_used ?? "").startsWith(`${BALANCED_VIBE_MODEL_TAG}|`)
    )
  ) return null

  const fallbackTag = String(cacheRow.model_used ?? "").split("|").find(part => part.startsWith("fallback="))
  if (fallbackTag && fallbackTag !== "fallback=incomplete_vibe_profile") return null

  return withParticipantBreakdownAliases(cacheRow)
}

async function findParticipantsByExactPhone(phoneNumber, columns = "id, assigned_number, name, phone_number, secure_token") {
  const normalizedPhone = normalizeParticipantPhone(phoneNumber)
  if (!isPlausibleParticipantPhone(normalizedPhone)) {
    return { normalizedPhone, participants: [], error: null }
  }

  const { data, error } = await supabase
    .from("participants")
    .select(columns)
    .eq("match_id", process.env.CURRENT_MATCH_ID || STATIC_MATCH_ID)
    .eq("phone_normalized", normalizedPhone)
    .order("created_at", { ascending: false })

  return { normalizedPhone, participants: data || [], error }
}

async function discardUnusedProvisionalParticipant(provisionalToken, authenticatedParticipantId) {
  const token = String(provisionalToken || '').trim()
  if (!token) return false

  const { data: provisional, error } = await supabase
    .from("participants")
    .select("id, name, phone_number, survey_data, summary, created_at")
    .eq("match_id", process.env.CURRENT_MATCH_ID || STATIC_MATCH_ID)
    .eq("secure_token", token)
    .maybeSingle()

  if (error || !provisional || provisional.id === authenticatedParticipantId) return false
  const createdAt = new Date(provisional.created_at || 0).getTime()
  const isRecent = Number.isFinite(createdAt) && Date.now() - createdAt <= 24 * 60 * 60 * 1000
  const isBlank = !provisional.name && !provisional.phone_number && !provisional.survey_data && !provisional.summary
  if (!isRecent || !isBlank) return false

  const { error: deleteError } = await supabase
    .from("participants")
    .delete()
    .eq("id", provisional.id)

  if (deleteError) {
    console.error("Could not discard provisional participant:", deleteError)
    return false
  }
  return true
}

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" })
  }
  const contentLength = Number(req.headers?.["content-length"] || 0)
  if (contentLength > 1_000_000) return res.status(413).json({ error: "Request body too large" })
  // A venue can put dozens of legitimate participants behind one public IP.
  // Keep a coarse flood limit here; authenticated Event3 traffic is limited by
  // the verified participant identity below, never a client-provided token alone.
  if (!enforceRateLimit(req, res, { key: "participant-ip-flood", limit: 6000, windowMs: 60_000 })) return

  if (!req.body?.action) return res.status(400).json({ error: 'Missing action' })

  const { action } = req.body
  const isLegalAcceptanceAction = action === "legal-acceptance-status" || action === "accept-legal-update"
  const isSurveyProgressAction = action === "survey-progress-heartbeat"
  if (!String(action).startsWith("e3-") && !isLegalAcceptanceAction && !isSurveyProgressAction && !enforceRateLimit(req, res, { key: "participant-api", limit: 120, windowMs: 60_000 })) return

  if (isLegalAcceptanceAction) {
    const secureToken = String(req.body?.secure_token || "").trim()
    if (!secureToken) return res.status(401).json({ error: "A participant token is required" })

    const { data: participant, error: participantError } = await supabase
      .from("participants")
      .select("id,assigned_number,survey_data,terms_version,privacy_notice_version,consented_at,event_id")
      .eq("match_id", process.env.CURRENT_MATCH_ID || STATIC_MATCH_ID)
      .eq("secure_token", secureToken)
      .maybeSingle()

    if (participantError) {
      logError("Legal acceptance participant lookup", participantError)
      return res.status(503).json({ error: "Could not verify participant identity", retryable: true })
    }
    if (!participant) return res.status(404).json({ error: "Participant not found" })
    if (!enforceRateLimit(req, res, {
      key: `legal-acceptance-${action}`,
      identity: participant.id,
      limit: action === "legal-acceptance-status" ? 120 : 10,
      windowMs: 60 * 60_000,
    })) return

    const { data: acceptanceRows, error: acceptanceError } = await supabase
      .from("participant_legal_acceptances")
      .select("document_bundle_version,terms_version,privacy_notice_version,accepted_at,acceptance_source")
      .eq("participant_id", participant.id)
      .in("document_bundle_version", LEGAL_ACCEPTED_DOCUMENT_VERSIONS)
      .order("accepted_at", { ascending: false })

    const acceptance = (acceptanceRows || []).find(isAcceptedLegalBundle) || null

    const migrationRequired = Boolean(acceptanceError && (
      ["42P01", "PGRST202", "PGRST205"].includes(acceptanceError.code)
      || String(acceptanceError.message || "").includes("participant_legal_acceptances")
    ))
    if (acceptanceError && !migrationRequired) {
      logError("Legal acceptance lookup", acceptanceError)
      return res.status(503).json({ error: "Could not verify legal acceptance", retryable: true })
    }

    if (action === "legal-acceptance-status") {
      return res.status(200).json({
        document_bundle_version: LEGAL_DOCUMENT_VERSION,
        terms_version: LEGAL_TERMS_VERSION,
        privacy_notice_version: LEGAL_PRIVACY_NOTICE_VERSION,
        accepted: hasCurrentLegalAcceptance(participant, acceptance),
        requires_acceptance: shouldRequireLegalAcceptance(participant, acceptance),
        accepted_at: acceptance?.accepted_at || (
          hasCurrentLegalAcceptance(participant, null) ? participant.consented_at : null
        ),
        migration_required: migrationRequired,
      })
    }

    if (req.body?.terms_accepted !== true || req.body?.privacy_acknowledged !== true) {
      return res.status(400).json({ error: "Explicit acceptance of both documents is required" })
    }
    if (migrationRequired) {
      return res.status(501).json({ error: "Legal acceptance storage is not deployed", migration_required: true })
    }

    const acceptedAt = new Date().toISOString()
    const row = buildLegalAcceptanceRow(participant, {
      eventId: participant.event_id,
      acceptedAt,
      source: "participant_popup",
    })
    const { data: saved, error: saveError } = await supabase.rpc("record_participant_legal_acceptance", {
      p_participant_id: row.participant_id,
      p_assigned_number: row.assigned_number,
      p_document_bundle_version: row.document_bundle_version,
      p_terms_version: row.terms_version,
      p_privacy_notice_version: row.privacy_notice_version,
      p_acceptance_source: row.acceptance_source,
      p_event_id: row.event_id,
      p_accepted_at: row.accepted_at,
      p_document_urls: row.document_urls,
    })
    if (saveError) {
      const rpcMissing = saveError.code === "PGRST202"
        || String(saveError.message || "").includes("record_participant_legal_acceptance")
      logError("Recording legal acceptance", saveError)
      return res.status(rpcMissing ? 501 : 503).json({
        error: rpcMissing ? "Legal acceptance migration is required" : "Could not record acceptance",
        migration_required: rpcMissing,
        retryable: !rpcMissing,
      })
    }

    return res.status(200).json({
      accepted: true,
      accepted_at: saved?.accepted_at || acceptedAt,
      document_bundle_version: LEGAL_DOCUMENT_VERSION,
    })
  }

  if (isSurveyProgressAction) {
    const secureToken = String(req.body?.secure_token || "").trim()
    if (!secureToken) return res.status(401).json({ error: "A participant token is required" })

    const heartbeat = normalizeSurveyProgressHeartbeat(req.body)
    if (heartbeat.error) return res.status(400).json({ error: heartbeat.error })

    const { data: participant, error: participantError } = await supabase
      .from("participants")
      .select("id,assigned_number,match_id,event_id,gender,age")
      .eq("match_id", process.env.CURRENT_MATCH_ID || STATIC_MATCH_ID)
      .eq("secure_token", secureToken)
      .maybeSingle()

    if (participantError) {
      logError("Survey progress participant lookup", participantError)
      return res.status(503).json({ error: "Could not verify participant identity", retryable: true })
    }
    if (!participant) return res.status(401).json({ error: "Invalid participant token" })
    if (!enforceRateLimit(req, res, {
      key: "survey-progress-heartbeat",
      identity: participant.id,
      limit: 60,
      windowMs: 60_000,
    })) return

    res.setHeader("Cache-Control", "no-store")

    if (!heartbeat.active) {
      const { error } = await supabase
        .from("survey_progress_presence")
        .update({
          is_active: false,
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("participant_id", participant.id)
        .eq("session_id", heartbeat.sessionId)

      if (error && !isSurveyProgressSchemaMissing(error)) {
        logError("Survey progress leave", error)
        return res.status(503).json({ error: "Could not update survey presence", retryable: true })
      }
      return res.status(200).json({ success: true, active: false, migration_required: isSurveyProgressSchemaMissing(error) })
    }

    const row = buildSurveyProgressPresenceRow(participant, heartbeat)
    const { error } = await supabase
      .from("survey_progress_presence")
      .upsert(row, { onConflict: "participant_id" })

    if (error) {
      const migrationRequired = isSurveyProgressSchemaMissing(error)
      if (!migrationRequired) logError("Survey progress heartbeat", error)
      return res.status(migrationRequired ? 501 : 503).json({
        error: migrationRequired ? "Survey progress tracking is not deployed" : "Could not update survey progress",
        migration_required: migrationRequired,
        retryable: !migrationRequired,
      })
    }

    return res.status(200).json({ success: true, active: true, progress_percent: row.progress_percent })
  }

  // TOKEN HANDLER ACTIONS
  if (action === "create-token") {
    if (!enforceRateLimit(req, res, { key: "participant-create", limit: 5, windowMs: 60 * 60_000 })) return
    // Check if registration is enabled
    try {
      const { data: eventState, error: eventError } = await supabase
        .from("event_state")
        .select("registration_enabled")
        .eq("match_id", "00000000-0000-0000-0000-000000000000")
        .single()

      // If registration is disabled, return error
      if (eventState && eventState.registration_enabled === false) {
        return res.status(403).json({ 
          error: "Registration is currently closed",
          message: "التسجيل مغلق حالياً - التوافق بدأ بالفعل"
        })
      }

      // If no event_state record exists, allow registration (default behavior)
      if (eventError && eventError.code !== 'PGRST116') {
        console.error("Error checking registration status:", eventError)
        // Continue with registration if we can't check status
      }
    } catch (err) {
      console.error("Error checking registration enabled:", err)
      // Continue with registration if we can't check status
    }

    // Auto-assign the next available number
    try {
      // Get the highest assigned number
      const { data: existingParticipants, error: fetchError } = await supabase
        .from("participants")
        .select("assigned_number")
        .eq("match_id", "00000000-0000-0000-0000-000000000000")
        .neq("assigned_number", 9999)  // Exclude organizer participant
        .order("assigned_number", { ascending: false })
        .limit(1)

      if (fetchError) {
        console.error("Fetch Error:", fetchError)
        return res.status(500).json({ error: "Database fetch failed" })
      }

      // Calculate next number (start from 1 if no participants exist)
      let nextNumber = existingParticipants && existingParticipants.length > 0 
        ? existingParticipants[0].assigned_number + 1 
        : 1
      
      // Skip 9999 as it's reserved for organizer
      if (nextNumber === 9999) {
        nextNumber = 10000;
      }

      // Check if this number already exists (race condition protection)
      const { data: existing, error: checkError } = await supabase
        .from("participants")
        .select("secure_token")
        .eq("assigned_number", nextNumber)
        .eq("match_id", "00000000-0000-0000-0000-000000000000")
        .single()

      if (existing) {
        // Number already exists, return existing token
        return res.status(200).json({ 
          secure_token: existing.secure_token,
          assigned_number: nextNumber,
          is_new: false
        })
      }

      if (checkError && checkError.code !== "PGRST116") {
        console.error("Check Token Error:", checkError)
        return res.status(500).json({ error: "Database check failed" })
      }

      // Get current event ID for new participants
      let currentEventId = 1 // Default to event 1
      try {
        const { data: eventState, error: eventError } = await supabase
          .from("event_state")
          .select("current_event_id")
          .eq("match_id", "00000000-0000-0000-0000-000000000000")
          .single()

        if (!eventError && eventState?.current_event_id) {
          currentEventId = eventState.current_event_id
        } else {
          // If no current event ID is set, determine it based on existing participants
          const { data: maxEventData, error: maxEventError } = await supabase
            .from("participants")
            .select("event_id")
            .order("event_id", { ascending: false })
            .limit(1)
            .single()

          if (!maxEventError && maxEventData?.event_id) {
            currentEventId = maxEventData.event_id
          }
        }
      } catch (err) {
        console.log("Using default event_id = 1 due to error:", err.message)
      }

      console.log(`Creating new participant with event_id: ${currentEventId}`)

      // Create new participant with auto-assigned number and current event_id
      const { data, error } = await supabase
        .from("participants")
        .insert([
          {
            assigned_number: nextNumber,
            match_id: "00000000-0000-0000-0000-000000000000",
            event_id: currentEventId,
          },
        ])
        .select("secure_token, assigned_number, event_id")
        .single()

      if (error) {
        console.error("Create Token Error:", error)
        return res.status(500).json({ error: "Database insert failed" })
      }

      return res.status(200).json({ 
        secure_token: data.secure_token,
        assigned_number: data.assigned_number,
        event_id: data.event_id,
        is_new: true
      })
    } catch (error) {
      console.error("Unexpected error:", error)
      return res.status(500).json({ error: "Unexpected error occurred" })
    }
  }

  // GROUP PHONE LOGIN: semi-login for groups by phone number
  if (action === "group-phone-login") {
    try {
      const { phone_number } = req.body
      const match_id = process.env.CURRENT_MATCH_ID || "00000000-0000-0000-0000-000000000000"

      if (!phone_number || typeof phone_number !== 'string') {
        return res.status(400).json({ success: false, error: "Missing or invalid phone_number" })
      }
      // Normalize: use last 7 digits (for higher uniqueness)
      const normalized = phone_number.replace(/\D/g, '')
      if (normalized.length < 7) {
        return res.status(400).json({ success: false, error: "رقم الهاتف يجب أن يحتوي على 7 أرقام على الأقل" })
      }
      const lastSeven = normalized.slice(-7)

      // Determine current event id
      let currentEventId = 1
      try {
        const { data: eventRow, error: eventErr } = await supabase
          .from("event_state")
          .select("current_event_id")
          .eq("match_id", match_id)
          .single()

        if (!eventErr && eventRow?.current_event_id) {
          currentEventId = eventRow.current_event_id
        } else if (eventErr && eventErr.code === 'PGRST116') {
          // Fallback: use maximum event_id from participants, match_results, or group_matches
          const [maxP, maxM, maxG] = await Promise.all([
            supabase.from("participants").select("event_id").order("event_id", { ascending: false }).limit(1).single(),
            supabase.from("match_results").select("event_id").order("event_id", { ascending: false }).limit(1).single(),
            supabase.from("group_matches").select("event_id").order("event_id", { ascending: false }).limit(1).single(),
          ])
          let maxId = 1
          if (!maxP.error && maxP.data?.event_id) maxId = Math.max(maxId, maxP.data.event_id)
          if (!maxM.error && maxM.data?.event_id) maxId = Math.max(maxId, maxM.data.event_id)
          if (!maxG.error && maxG.data?.event_id) maxId = Math.max(maxId, maxG.data.event_id)
          currentEventId = maxId
        }
      } catch (e) {
        // keep default 1
      }

      // Special-case admin bypass: participant #7 (phone 0560899666) always allowed into groups with a fake group
      try {
        const isAdminByPhone = false
        if (isAdminByPhone) {
          // Try to fetch existing participant #7 for token/name; otherwise use sensible defaults
          let adminRow = null
          try {
            const { data: row, error: rowErr } = await supabase
              .from("participants")
              .select("assigned_number, secure_token, name")
              .eq("match_id", match_id)
              .eq("assigned_number", 7)
              .order("created_at", { ascending: false })
              .limit(1)
              .single()
            if (!rowErr && row) adminRow = row
          } catch (_) {}

          const adminName = adminRow?.name || 'أدمن'
          const adminToken = adminRow?.secure_token || null

          // Build a randomized fake group (3–6 participants including admin #7)
          const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min
          const groupSize = randInt(3, 6)
          const candidatePool = []
          // Create pool of candidate numbers (avoid 7 and 9999)
          for (let n = 50; n <= 250; n++) {
            if (n !== 7 && n !== 9999) candidatePool.push(n)
          }
          // Shuffle and pick (groupSize - 1) others
          for (let i = candidatePool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            const tmp = candidatePool[i]
            candidatePool[i] = candidatePool[j]
            candidatePool[j] = tmp
          }
          const others = candidatePool.slice(0, Math.max(0, groupSize - 1))
          const participant_numbers = [7, ...others]
          const participant_names = participant_numbers.map((num, idx) => idx === 0 ? (adminName || `أدمن #7`) : `عضو #${num}`)
          const group_members = participant_names
          const table_number = randInt(1, 30)
          const group_number = randInt(1, 50)

          return res.status(200).json({
            success: true,
            admin_bypass: true,
            event_id: currentEventId,
            assigned_number: 7,
            secure_token: adminToken,
            name: adminName,
            table_number,
            group_number,
            group_members,
            participant_numbers,
            participant_names
          })
        }
      } catch (_) {}

      // Find participant(s) by phone last 7 digits (across all events for this match)
      const { data: candidates, error: searchErr } = await supabase
        .from("participants")
        .select("id, assigned_number, secure_token, name, survey_data, phone_number, event_id, created_at")
        .eq("match_id", match_id)
        .not("phone_number", "is", null)
        .ilike("phone_number", `%${lastSeven}`)
        .order("created_at", { ascending: false })

      if (searchErr) {
        logError("group-phone-login: participant search error", searchErr)
        return res.status(500).json({ success: false, error: "فشل البحث عن المشارك" })
      }

      if (!candidates || candidates.length === 0) {
        return res.status(404).json({ success: false, error: "لم يتم العثور على مشارك برقم الهاتف هذا" })
      }

      // If multiple candidates share the same ending, try to pick one that has a group assignment
      // Sort by created_at desc as secondary heuristic
      const sorted = [...candidates].sort((a, b) => {
        const at = a.created_at ? new Date(a.created_at).getTime() : 0
        const bt = b.created_at ? new Date(b.created_at).getTime() : 0
        return bt - at
      })

      let chosen = null
      let groupInfo = null

      // Helper to resolve group info from group_matches first, then match_results round 0
      const resolveGroupInfo = async (assignedNumber) => {
        // Try group_matches
        const { data: groups, error: groupErr } = await supabase
          .from("group_matches")
          .select("group_id, group_number, table_number, participant_numbers, participant_names")
          .eq("match_id", match_id)
          .eq("event_id", currentEventId)

        if (!groupErr && groups && groups.length > 0) {
          const found = groups.find(g => {
            const nums = Array.isArray(g.participant_numbers) ? g.participant_numbers : []
            const parsed = nums.map(n => (typeof n === 'string' ? parseInt(n, 10) : n))
            return parsed.includes(assignedNumber)
          })
          if (found) {
            // Build members: prefer provided names, fallback to numbered labels
            const nums = Array.isArray(found.participant_numbers) ? found.participant_numbers : []
            const names = Array.isArray(found.participant_names) ? found.participant_names : []
            const members = nums.map((n, idx) => {
              const num = typeof n === 'string' ? parseInt(n, 10) : n
              const baseName = names[idx] || `المشارك #${num}`
              return baseName
            })
            return {
              table_number: found.table_number ?? null,
              group_number: found.group_number ?? null,
              participant_numbers: nums,
              participant_names: names,
              group_members: members,
              source: 'group_matches'
            }
          }
        }

        // Fallback: match_results round 0
        const { data: groupRound, error: roundErr } = await supabase
          .from("match_results")
          .select("participant_a_number, participant_b_number, participant_c_number, participant_d_number, participant_e_number, participant_f_number, table_number, group_number")
          .eq("match_id", match_id)
          .eq("event_id", currentEventId)
          .eq("round", 0)
          .or(`participant_a_number.eq.${assignedNumber},participant_b_number.eq.${assignedNumber},participant_c_number.eq.${assignedNumber},participant_d_number.eq.${assignedNumber},participant_e_number.eq.${assignedNumber},participant_f_number.eq.${assignedNumber}`)
          .limit(1)
          .single()

        if (!roundErr && groupRound) {
          const nums = [
            groupRound.participant_a_number,
            groupRound.participant_b_number,
            groupRound.participant_c_number,
            groupRound.participant_d_number,
            groupRound.participant_e_number,
            groupRound.participant_f_number
          ].filter(n => !!n && n !== 9999)

          // Fetch names for these numbers
          let names = []
          try {
            const { data: rows } = await supabase
              .from("participants")
              .select("assigned_number, name, survey_data")
              .eq("match_id", match_id)
              .eq("event_id", currentEventId)
              .in("assigned_number", nums)
            names = (rows || []).map(r => ({ num: r.assigned_number, name: r.name || r?.survey_data?.name || `المشارك #${r.assigned_number}` }))
          } catch (_) {}
          const memberNames = nums.map(num => names.find(n => n.num === num)?.name || `المشارك #${num}`)
          return {
            table_number: groupRound.table_number ?? null,
            group_number: groupRound.group_number ?? null,
            participant_numbers: nums,
            participant_names: memberNames,
            group_members: memberNames,
            source: 'match_results'
          }
        }

        return null
      }

      for (const cand of sorted) {
        const info = await resolveGroupInfo(cand.assigned_number)
        if (info) {
          chosen = cand
          groupInfo = info
          break
        }
      }

      // If none of the candidates have a group, allow login for participants
      // explicitly excluded from group generation (admin group-only exclusion, code -2)
      if (!chosen) {
        try {
          for (const cand of sorted) {
            const { data: ex, error: exErr } = await supabase
              .from("excluded_pairs")
              .select("id")
              .eq("match_id", match_id)
              .eq("participant1_number", cand.assigned_number)
              .eq("participant2_number", -2)
              .limit(1)

            if (!exErr && Array.isArray(ex) && ex.length > 0) {
              const name = cand.name || cand?.survey_data?.name || cand?.survey_data?.answers?.name || `المشارك #${cand.assigned_number}`
              // Return a success with admin_bypass to let the client proceed without a real group
              return res.status(200).json({
                success: true,
                admin_bypass: true,
                event_id: currentEventId,
                assigned_number: cand.assigned_number,
                secure_token: cand.secure_token,
                name,
                table_number: null,
                group_number: null,
                group_members: [],
                participant_numbers: [],
                participant_names: []
              })
            }
          }
        } catch (_) {}

        // Otherwise, fail as before
        return res.status(403).json({ success: false, error: "لم يتم العثور على مجموعة لك في الحدث الحالي" })
      }

      const name = chosen.name || chosen?.survey_data?.name || chosen?.survey_data?.answers?.name || `المشارك #${chosen.assigned_number}`

      return res.status(200).json({
        success: true,
        event_id: currentEventId,
        assigned_number: chosen.assigned_number,
        secure_token: chosen.secure_token,
        name,
        table_number: groupInfo?.table_number ?? null,
        group_number: groupInfo?.group_number ?? null,
        group_members: groupInfo?.group_members || [],
        participant_numbers: groupInfo?.participant_numbers || [],
        participant_names: groupInfo?.participant_names || []
      })

    } catch (error) {
      console.error("Error in group-phone-login:", error)
      return res.status(500).json({ success: false, error: "حدث خطأ أثناء تسجيل الدخول" })
    }
  }

  if (action === "save-match-insights") {
    if (!enforceRateLimit(req, res, { key: "participant-match-insights", limit: 12, windowMs: 60_000 })) return
    const secureToken = String(req.body?.secure_token || '').trim()
    if (!secureToken) return res.status(401).json({ error: 'A participant token is required' })

    const matchValidation = validateMatchInsights(req.body?.answers, { requireAll: false })
    const profileValidation = validateProfileDataCollection(req.body?.answers, { requireAll: false })
    const validatedAnswers = { ...matchValidation.answers, ...profileValidation.answers }
    const validationErrors = { ...matchValidation.errors, ...profileValidation.errors }
    if (!matchValidation.valid || !profileValidation.valid || Object.keys(validatedAnswers).length === 0) {
      return res.status(400).json({ error: 'Invalid survey update answers', fields: validationErrors })
    }

    const { data: participant, error: lookupError } = await supabase
      .from('participants')
      .select('id, assigned_number, survey_data')
      .eq('secure_token', secureToken)
      .single()
    if (lookupError || !participant) return res.status(404).json({ error: 'Participant not found' })

    let storedSurveyData = participant.survey_data
    if (typeof storedSurveyData === 'string') {
      try { storedSurveyData = JSON.parse(storedSurveyData) } catch (_) { storedSurveyData = {} }
    }
    if (!storedSurveyData || typeof storedSurveyData !== 'object' || Array.isArray(storedSurveyData)) storedSurveyData = {}
    const existingAnswers = storedSurveyData.answers && typeof storedSurveyData.answers === 'object' && !Array.isArray(storedSurveyData.answers)
      ? storedSurveyData.answers
      : {}
    const mergedAnswers = { ...existingAnswers, ...validatedAnswers }
    const includesScoredInsights = Object.keys(matchValidation.answers).some((id) => id !== 'age_flex_one_year')
    const nextSurveyData = {
      ...storedSurveyData,
      answers: mergedAnswers,
      ...(includesScoredInsights ? {
        vibeDescription: buildVibeDescription({ ...storedSurveyData, ...mergedAnswers }),
        matchInsightsVersion: MATCH_INSIGHTS_VERSION,
        matchInsightsUpdatedAt: new Date().toISOString(),
      } : {}),
    }

    const participantUpdate = { survey_data: nextSurveyData }
    const ageFlexAnswer = matchValidation.answers.age_flex_one_year
    if (ageFlexAnswer === 'accept') participantUpdate.age_flex_one_year = true
    else if (ageFlexAnswer === 'decline') participantUpdate.age_flex_one_year = false
    else if (ageFlexAnswer === 'not_applicable') participantUpdate.age_flex_one_year = null
    for (const [column, value] of Object.entries(profileValidation.answers)) {
      participantUpdate[column] = Number(value)
    }

    const { error: updateError } = await supabase
      .from('participants')
      .update(participantUpdate)
      .eq('id', participant.id)
    if (updateError) {
      logError('Error saving match insights', updateError)
      return res.status(500).json({ error: 'Failed to save answers' })
    }

    _e3TokenCache.delete(secureToken)
    return res.status(200).json({ success: true, assigned_number: participant.assigned_number, survey_data: nextSurveyData })
  }

  if (action === "resolve-token") {
    console.log("[API] Action: resolve-token started");
    const secureToken = typeof req.body?.secure_token === "string" ? req.body.secure_token.trim() : "";
    if (!secureToken) {
      console.log("[API] Error: Missing secure_token");
      return res.status(400).json({ error: 'Missing secure_token' });
    }
    const { data, error } = await supabase
      .from("participants")
      .select("assigned_number, name, survey_data, summary, signup_for_next_event, auto_signup_next_event, humor_banter_style, early_openness_comfort, same_gender_preference, any_gender_preference, gender, phone_number, age, nationality, prefer_same_nationality, preferred_age_min, preferred_age_max, open_age_preference, age_flex_one_year, intent_goal, open_intent_goal_mismatch, expression_language, minimum_partner_religious_commitment, social_relationship_style")
      .eq("secure_token", secureToken)
      .single();

    console.log("[API] Participant token lookup completed", { found: Boolean(data), hasError: Boolean(error) });

    if (error || !data) {
      console.log("[API] Error: Participant not found or DB error.");
      return res.status(404).json({ error: 'Participant not found' });
    }

    // Compute gender preference from JSON or columns (normalize to: opposite_gender | same_gender | any_gender)
    let computedGenderPreference = "opposite_gender";
    try {
      const jsonPref = data?.survey_data?.answers?.gender_preference;
      const userGender = data?.gender || data?.survey_data?.answers?.gender || null;
      if (jsonPref === 'opposite_gender' || jsonPref === 'same_gender' || jsonPref === 'any_gender') {
        computedGenderPreference = jsonPref;
      } else if (jsonPref === 'any') {
        computedGenderPreference = 'any_gender';
      } else if (jsonPref === 'male' || jsonPref === 'female') {
        // Map raw choice to normalized using participant gender when available
        if (userGender && typeof userGender === 'string') {
          computedGenderPreference = (String(userGender).toLowerCase() === String(jsonPref).toLowerCase())
            ? 'same_gender'
            : 'opposite_gender';
        } else {
          computedGenderPreference = 'opposite_gender';
        }
      } else if (data?.any_gender_preference === true) {
        computedGenderPreference = 'any_gender';
      } else if (data?.same_gender_preference === true) {
        computedGenderPreference = 'same_gender';
      } else {
        computedGenderPreference = 'opposite_gender';
      }
    } catch (_) {}

    // Fetch participant history if they exist
    let history = []
    if (data.assigned_number) {
      console.log(`[API] Fetching history for participant #${data.assigned_number}`);
      try {
        const { data: matches, error: matchError } = await supabase
          .from("match_results")
          .select(`
            *,
            participant_a:participants!match_results_participant_a_id_fkey(name, age, phone_number),
            participant_b:participants!match_results_participant_b_id_fkey(name, age, phone_number)
          `)
          .eq("match_id", "00000000-0000-0000-0000-000000000000")
          .or(`participant_a_number.eq.${data.assigned_number},participant_b_number.eq.${data.assigned_number}`)
          .order("created_at", { ascending: false });

        console.log("[API] History query completed", { count: matches?.length || 0, hasError: Boolean(matchError) });

        if (!matchError && matches) {
          history = matches.map(match => {
            // Determine which participant is the partner
            const isParticipantA = match.participant_a_number === data.assigned_number
            const partnerNumber = isParticipantA ? match.participant_b_number : match.participant_a_number
            const partnerInfo = isParticipantA ? match.participant_b : match.participant_a
            const wantsMatch = isParticipantA ? match.participant_a_wants_match : match.participant_b_wants_match
            const partnerWantsMatch = isParticipantA ? match.participant_b_wants_match : match.participant_a_wants_match
            const scoreSnapshotBreakdown = participantBreakdownFromScoreSnapshot(match.score_snapshot, {
              scoreModelVersion: match.score_model_version,
              scoreContentHash: match.score_content_hash,
              storedTotal: match.compatibility_score,
            })
            
            return {
              with: partnerNumber,
              partner_name: partnerInfo?.name || `لاعب رقم ${partnerNumber}`,
              partner_age: partnerInfo?.age || null,
              partner_phone: partnerInfo?.phone_number || null,
              type: match.match_type || "غير محدد",
              reason: match.reason || "السبب غير متوفر",
              round: match.round ?? 1,
              table_number: match.table_number,
              score: match.compatibility_score ?? scoreSnapshotBreakdown?.total ?? 0,
              score_model_version: scoreSnapshotBreakdown ? (match.score_model_version ?? null) : null,
              score_content_hash: scoreSnapshotBreakdown ? (match.score_content_hash ?? null) : null,
              score_snapshot: scoreSnapshotBreakdown ? (match.score_snapshot ?? null) : null,
              score_provenance_valid: !!scoreSnapshotBreakdown,
              breakdown: scoreSnapshotBreakdown,
              is_repeat_match: match.is_repeat_match || false,
              mutual_match: match.mutual_match || false,
              wants_match: wantsMatch,
              partner_wants_match: partnerWantsMatch,
              created_at: match.created_at,
              // Persisted legacy fields remain available for old rows; they are
              // never relabelled as balanced components without a snapshot.
              synergy_score: match.synergy_score ?? null,
              humor_open_score: match.humor_open_score ?? null,
              intent_score: match.intent_score ?? null,
              communication_compatibility_score: match.communication_compatibility_score ?? null,
              lifestyle_compatibility_score: match.lifestyle_compatibility_score ?? null,
              core_values_compatibility_score: match.core_values_compatibility_score ?? null,
              vibe_compatibility_score: match.vibe_compatibility_score ?? null,
            }
          })
        }
      } catch (historyError) {
        console.error("[API] CRITICAL: Error fetching participant history:", historyError)
        // Don't fail the request if history fetch fails
      }
    }

    // ── Fetch Event 3 (5.0) matches ──
    // Same logic as get-match-results: only include if results_visible or phase is final_reveal
    try {
      const E3_MATCH_ID = "00000000-0000-0000-0000-000000000003"
      const MAIN_MATCH = "00000000-0000-0000-0000-000000000000"
      const { data: e3State } = await supabase
        .from("event_state")
        .select("phase,current_event_id,results_visible,test_mode_active")
        .eq("match_id", E3_MATCH_ID)
        .maybeSingle()
      const e3Finished = e3State?.phase === "final_reveal" || e3State?.results_visible === true
      const hiddenTestEventId = e3State?.test_mode_active === true
        ? Number(e3State?.current_event_id)
        : null
      console.log(`[resolve-token] Event3 state for #${data.assigned_number}:`, { phase: e3State?.phase, results_visible: e3State?.results_visible, e3Finished })

      if (e3Finished) {
        let e3Matches = null
        let e3MatchErr = null
        try {
          const { data: e3data, error: e3error } = await supabase
            .from("event3_matches")
            .select("event_id,phase2_partner,phase2_score,phase2_score_model_version,phase2_score_content_hash,phase2_score_snapshot,phase2_word,phase2_feedback,phase3_partner,phase3_score,phase3_score_model_version,phase3_score_content_hash,phase3_score_snapshot,phase3_word,phase3_feedback,phase4_partner,phase4_word,phase4_feedback,match_preference")
            .eq("match_id", E3_MATCH_ID)
            .eq("participant_number", data.assigned_number)
          e3Matches = e3data
          e3MatchErr = e3error
        } catch (err) {
          e3MatchErr = err
        }
        console.log(`[resolve-token] Event3 matches for #${data.assigned_number}:`, { count: e3Matches?.length || 0, error: e3MatchErr?.message })

        if (e3MatchErr) {
          console.error("[resolve-token] Event3 matches query error:", e3MatchErr.message)
          const { data: fbData } = await supabase
            .from("event3_matches")
            .select("event_id,phase2_partner,phase2_score,phase2_word,phase2_feedback,phase3_partner,phase3_score,phase3_word,phase3_feedback")
            .eq("match_id", E3_MATCH_ID)
            .eq("participant_number", data.assigned_number)
          e3Matches = fbData
        }

        if (hiddenTestEventId) {
          e3Matches = (e3Matches || []).filter(match => Number(match.event_id) !== hiddenTestEventId)
        }
        if (e3Matches && e3Matches.length > 0) {
          const allPartnerNums = [...new Set(
            e3Matches.flatMap(m => [m.phase2_partner, m.phase3_partner, m.phase4_partner]).filter(Boolean)
          )]
          const partnerMap = {}
          if (allPartnerNums.length > 0) {
            const { data: partners } = await supabase
              .from("participants")
              .select("assigned_number,name,age,phone_number,survey_data")
              .eq("match_id", MAIN_MATCH)
              .in("assigned_number", allPartnerNums)
            for (const p of partners || []) {
              const sd = typeof p.survey_data === "string" ? JSON.parse(p.survey_data || "{}") : (p.survey_data || {})
              partnerMap[p.assigned_number] = {
                name: p.name || sd?.answers?.name || sd?.name || `#${p.assigned_number}`,
                age: p.age || null,
                phone: p.phone_number || null,
              }
            }
          }

          for (const e3Match of e3Matches) {
            const evId = e3Match.event_id || 20
            const historicalEventFormat = await loadEvent3Format(supabase, E3_MATCH_ID, evId)
            const isChoiceOnlyHistory = historicalEventFormat === "choice_only_three_groups"
            let p2PartnerFb = null, p3PartnerFb = null, p4PartnerFb = null
            if (e3Match.phase2_partner) {
              const { data: p2Row } = await supabase.from("event3_matches").select("phase2_feedback").eq("match_id", E3_MATCH_ID).eq("event_id", evId).eq("participant_number", e3Match.phase2_partner).maybeSingle()
              p2PartnerFb = p2Row?.phase2_feedback || null
            }
            if (e3Match.phase3_partner) {
              const { data: p3Row } = await supabase.from("event3_matches").select("phase3_feedback").eq("match_id", E3_MATCH_ID).eq("event_id", evId).eq("participant_number", e3Match.phase3_partner).maybeSingle()
              p3PartnerFb = p3Row?.phase3_feedback || null
            }
            if (isChoiceOnlyHistory && e3Match.phase4_partner) {
              const { data: p4Row } = await supabase.from("event3_matches").select("phase4_feedback").eq("match_id", E3_MATCH_ID).eq("event_id", evId).eq("participant_number", e3Match.phase4_partner).maybeSingle()
              p4PartnerFb = p4Row?.phase4_feedback || null
            }

            if (e3Match.phase2_partner) {
              const p2Partner = partnerMap[e3Match.phase2_partner]
              const p2Breakdown = isChoiceOnlyHistory ? null : participantBreakdownFromScoreSnapshot(e3Match.phase2_score_snapshot, {
                scoreModelVersion: e3Match.phase2_score_model_version,
                scoreContentHash: e3Match.phase2_score_content_hash,
                storedTotal: e3Match.phase2_score,
              })
              const myFb2 = e3Match.phase2_feedback || null
              const myWant2 = myFb2?.wantConnect ?? null
              const partnerWant2 = p2PartnerFb?.wantConnect ?? null
              const contact2 = buildEvent3MutualContactShare({
                myFeedback: myFb2,
                partnerFeedback: p2PartnerFb,
                partnerPhone: p2Partner?.phone,
              })
              history.push({
                with: e3Match.phase2_partner,
                partner_name: p2Partner?.name || `لاعب رقم ${e3Match.phase2_partner}`,
                partner_age: p2Partner?.age || null,
                ...contact2,
                partner_event_id: evId,
                type: "choice",
                reason: isChoiceOnlyHistory ? "أقوى اختيار متبادل في ترتيبكما" : formatParticipantBreakdownReason(p2Breakdown),
                round: 20,
                table_number: null,
                score: isChoiceOnlyHistory ? null : e3Match.phase2_score ?? p2Breakdown?.total ?? 0,
                score_model_version: p2Breakdown ? (e3Match.phase2_score_model_version ?? null) : null,
                score_content_hash: p2Breakdown ? (e3Match.phase2_score_content_hash ?? null) : null,
                score_snapshot: p2Breakdown ? (e3Match.phase2_score_snapshot ?? null) : null,
                score_provenance_valid: !!p2Breakdown,
                is_repeat_match: false,
                wants_match: myWant2,
                partner_wants_match: partnerWant2 ?? null,
                created_at: null,
                ai_personality_analysis: null,
                event_id: evId,
                event_format: historicalEventFormat,
                partner_message: null,
                match_type: "choice",
                match_label: isChoiceOnlyHistory ? "اختيارك الأول" : "اختيارك الشخصي",
                match_word: e3Match.phase2_word || null,
                breakdown: p2Breakdown,
                match_preference: e3Match.match_preference || null,
                my_feedback: myFb2 ? {
                  compatibilityRate: myFb2.compatibilityRate ?? null,
                  conversationQuality: myFb2.conversationQuality ?? null,
                  personalConnection: myFb2.personalConnection ?? null,
                  wantConnect: myFb2.wantConnect ?? null,
                  sliderMoved: myFb2.sliderMoved ?? false,
                  organizerImpression: myFb2.organizerImpression ?? null,
                } : null,
                partner_feedback: p2PartnerFb ? {
                  wantConnect: p2PartnerFb.wantConnect ?? null,
                  compatibilityRate: p2PartnerFb.compatibilityRate ?? null,
                } : null,
                humor_early_openness_bonus: "none",
                synergy_score: p2Breakdown?.synergy ?? null,
                humor_open_score: p2Breakdown?.humorOpen ?? null,
                intent_score: p2Breakdown?.intent ?? null,
                communication_compatibility_score: p2Breakdown?.communication ?? null,
                lifestyle_compatibility_score: p2Breakdown?.lifestyle ?? null,
                vibe_compatibility_score: p2Breakdown?.vibe ?? null,
              })
            }

            if (e3Match.phase3_partner) {
              const p3Partner = partnerMap[e3Match.phase3_partner]
              const p3Breakdown = isChoiceOnlyHistory ? null : participantBreakdownFromScoreSnapshot(e3Match.phase3_score_snapshot, {
                scoreModelVersion: e3Match.phase3_score_model_version,
                scoreContentHash: e3Match.phase3_score_content_hash,
                storedTotal: e3Match.phase3_score,
              })
              const myFb3 = e3Match.phase3_feedback || null
              const myWant3 = myFb3?.wantConnect ?? null
              const partnerWant3 = p3PartnerFb?.wantConnect ?? null
              const contact3 = buildEvent3MutualContactShare({
                myFeedback: myFb3,
                partnerFeedback: p3PartnerFb,
                partnerPhone: p3Partner?.phone,
              })
              history.push({
                with: e3Match.phase3_partner,
                partner_name: p3Partner?.name || `لاعب رقم ${e3Match.phase3_partner}`,
                partner_age: p3Partner?.age || null,
                ...contact3,
                partner_event_id: evId,
                type: "algorithm",
                reason: isChoiceOnlyHistory ? "أقوى اختيار متبادل متبقٍ بعد استبعاد شريك اللقاء الأول" : formatParticipantBreakdownReason(p3Breakdown),
                round: 21,
                table_number: null,
                score: isChoiceOnlyHistory ? null : e3Match.phase3_score ?? p3Breakdown?.total ?? 0,
                score_model_version: p3Breakdown ? (e3Match.phase3_score_model_version ?? null) : null,
                score_content_hash: p3Breakdown ? (e3Match.phase3_score_content_hash ?? null) : null,
                score_snapshot: p3Breakdown ? (e3Match.phase3_score_snapshot ?? null) : null,
                score_provenance_valid: !!p3Breakdown,
                is_repeat_match: false,
                wants_match: myWant3,
                partner_wants_match: partnerWant3 ?? null,
                created_at: null,
                ai_personality_analysis: null,
                event_id: evId,
                event_format: historicalEventFormat,
                partner_message: null,
                match_type: "algorithm",
                match_label: isChoiceOnlyHistory ? "اختيارك الثاني" : "اختيار الخوارزمية",
                match_word: e3Match.phase3_word || null,
                breakdown: p3Breakdown,
                match_preference: e3Match.match_preference || null,
                my_feedback: myFb3 ? {
                  compatibilityRate: myFb3.compatibilityRate ?? null,
                  conversationQuality: myFb3.conversationQuality ?? null,
                  personalConnection: myFb3.personalConnection ?? null,
                  wantConnect: myFb3.wantConnect ?? null,
                  sliderMoved: myFb3.sliderMoved ?? false,
                  organizerImpression: myFb3.organizerImpression ?? null,
                } : null,
                partner_feedback: p3PartnerFb ? {
                  wantConnect: p3PartnerFb.wantConnect ?? null,
                  compatibilityRate: p3PartnerFb.compatibilityRate ?? null,
                } : null,
                humor_early_openness_bonus: "none",
                synergy_score: p3Breakdown?.synergy ?? null,
                humor_open_score: p3Breakdown?.humorOpen ?? null,
                intent_score: p3Breakdown?.intent ?? null,
                communication_compatibility_score: p3Breakdown?.communication ?? null,
                lifestyle_compatibility_score: p3Breakdown?.lifestyle ?? null,
                vibe_compatibility_score: p3Breakdown?.vibe ?? null,
              })
            }

            if (isChoiceOnlyHistory && e3Match.phase4_partner) {
              const p4Partner = partnerMap[e3Match.phase4_partner]
              const myFb4 = e3Match.phase4_feedback || null
              const myWant4 = myFb4?.wantConnect ?? null
              const partnerWant4 = p4PartnerFb?.wantConnect ?? null
              const contact4 = buildEvent3MutualContactShare({
                myFeedback: myFb4,
                partnerFeedback: p4PartnerFb,
                partnerPhone: p4Partner?.phone,
              })
              history.push({
                with: e3Match.phase4_partner,
                partner_name: p4Partner?.name || `لاعب رقم ${e3Match.phase4_partner}`,
                partner_age: p4Partner?.age || null,
                ...contact4,
                partner_event_id: evId,
                type: "third_choice",
                reason: "أقوى اختيار متبادل متبقٍ بعد استبعاد شريكي اللقاءين السابقين",
                round: 22,
                table_number: null,
                score: null,
                score_model_version: null,
                score_content_hash: null,
                score_snapshot: null,
                score_provenance_valid: false,
                is_repeat_match: false,
                wants_match: myWant4,
                partner_wants_match: partnerWant4 ?? null,
                created_at: null,
                ai_personality_analysis: null,
                event_id: evId,
                event_format: historicalEventFormat,
                partner_message: null,
                match_type: "third_choice",
                match_label: "اختيارك الثالث",
                match_word: e3Match.phase4_word || null,
                breakdown: null,
                match_preference: e3Match.match_preference || null,
                my_feedback: myFb4 ? {
                  compatibilityRate: myFb4.compatibilityRate ?? null,
                  conversationQuality: myFb4.conversationQuality ?? null,
                  personalConnection: myFb4.personalConnection ?? null,
                  wantConnect: myFb4.wantConnect ?? null,
                  sliderMoved: myFb4.sliderMoved ?? false,
                  organizerImpression: myFb4.organizerImpression ?? null,
                } : null,
                partner_feedback: p4PartnerFb ? {
                  wantConnect: p4PartnerFb.wantConnect ?? null,
                  compatibilityRate: p4PartnerFb.compatibilityRate ?? null,
                } : null,
                humor_early_openness_bonus: "none",
                synergy_score: null,
                humor_open_score: null,
                intent_score: null,
                communication_compatibility_score: null,
                lifestyle_compatibility_score: null,
                vibe_compatibility_score: null,
              })
            }
          }
        }
      }
    } catch (e3Err) {
      console.log("[resolve-token] Event3 matches fetch skipped:", e3Err.message)
    }

    console.log(`[resolve-token] Successfully resolved token for #${data.assigned_number}. History count: ${history.length}`);
    return res.status(200).json({
      success: true,
      assigned_number: data.assigned_number,
      name: data.name,
      survey_data: data.survey_data,
      summary: data.summary,
      signup_for_next_event: data.signup_for_next_event,
      auto_signup_next_event: data.auto_signup_next_event,
      humor_banter_style: data.humor_banter_style,
      early_openness_comfort: data.early_openness_comfort,
      gender_preference: computedGenderPreference,
      same_gender_preference: typeof data.same_gender_preference === 'boolean' ? data.same_gender_preference : null,
      any_gender_preference: typeof data.any_gender_preference === 'boolean' ? data.any_gender_preference : null,
      // Extra fields to help client-side completeness checks with fallbacks
      gender: data.gender || null,
      phone_number: data.phone_number || null,
      age: data.age || null,
      nationality: data.nationality || null,
      prefer_same_nationality: typeof data.prefer_same_nationality === 'boolean' ? data.prefer_same_nationality : null,
      preferred_age_min: data.preferred_age_min ?? null,
      preferred_age_max: data.preferred_age_max ?? null,
      open_age_preference: typeof data.open_age_preference === 'boolean' ? data.open_age_preference : null,
      age_flex_one_year: typeof data.age_flex_one_year === 'boolean' ? data.age_flex_one_year : null,
      intent_goal: data.intent_goal || null,
      open_intent_goal_mismatch: typeof data.open_intent_goal_mismatch === 'boolean' ? data.open_intent_goal_mismatch : null,
      expression_language: data.expression_language ?? null,
      minimum_partner_religious_commitment: data.minimum_partner_religious_commitment ?? null,
      social_relationship_style: data.social_relationship_style ?? null,
      history: history.map(protectPartnerPrivacy)
    })
  }

  // MATCH PREFERENCE ACTION
  if (action === "match-preference") {
    try {
      const { assigned_number, partner_number, wants_match, round = 1, event_id } = req.body
      const match_id = "00000000-0000-0000-0000-000000000000"

      if (!assigned_number || !partner_number) {
        return res.status(400).json({ error: "Missing assigned_number or partner_number" })
      }

      if (typeof wants_match !== 'boolean') {
        return res.status(400).json({ error: "wants_match must be a boolean" })
      }

      // Find the match result for this pair
      const { data: matchResults, error: findError } = await supabase
        .from("match_results")
        .select("*")
        .eq("match_id", match_id)
        .eq("event_id", event_id || 1)
        .eq("round", round)
        .or(`and(participant_a_number.eq.${assigned_number},participant_b_number.eq.${partner_number}),and(participant_a_number.eq.${partner_number},participant_b_number.eq.${assigned_number})`)

      if (findError) {
        console.error("Error finding match result:", findError)
        return res.status(500).json({ error: "Failed to find match result" })
      }

      if (!matchResults || matchResults.length === 0) {
        return res.status(404).json({ error: "Match result not found" })
      }

      const matchResult = matchResults[0]
      
      // Determine which participant is making the preference
      const isParticipantA = matchResult.participant_a_number === assigned_number
      const updateField = isParticipantA ? 'participant_a_wants_match' : 'participant_b_wants_match'
      const partnerField = isParticipantA ? 'participant_b_wants_match' : 'participant_a_wants_match'
      
      // Update the match preference
      const updateData = {
        [updateField]: wants_match
      }
      
      // Check if both participants want to match to set mutual_match
      const partnerWantsMatch = matchResult[partnerField]
      if (partnerWantsMatch !== null) {
        updateData.mutual_match = wants_match && partnerWantsMatch
      }

      const { error: updateError } = await supabase
        .from("match_results")
        .update(updateData)
        .eq("id", matchResult.id)

      if (updateError) {
        console.error("Error updating match preference:", updateError)
        return res.status(500).json({ error: "Failed to update match preference" })
      }

      // If both participants want to match, fetch partner information
      let partnerInfo = null
      if (updateData.mutual_match) {
        const { data: partnerData, error: partnerError } = await supabase
          .from("participants")
          .select("name, age, phone_number")
          .eq("assigned_number", partner_number)
          .eq("match_id", match_id)
          .eq("event_id", event_id || 1)
          .single()

        if (!partnerError && partnerData) {
          partnerInfo = {
            name: partnerData.name,
            age: partnerData.age,
            phone_number: partnerData.phone_number
          }
        }
      }

      return res.status(200).json({
        success: true,
        mutual_match: updateData.mutual_match || false,
        partner_info: partnerInfo
      })

    } catch (error) {
      console.error("Unexpected error in match-preference:", error)
      return res.status(500).json({ error: "Unexpected error occurred" })
    }
  }

  // SAVE PARTICIPANT ACTION
  if (action === "save-participant") {
    let phoneConflictRequiresOtp = false
    try {
      console.log('📨 Received save-participant request')

      const { assigned_number, summary, survey_data, feedback, round, secure_token, event_id } = req.body
      const match_id = process.env.CURRENT_MATCH_ID || "00000000-0000-0000-0000-000000000000"

      if (!req.body?.assigned_number) {
        console.error('❌ Missing assigned_number in request body')
        return res.status(400).json({ error: 'Missing assigned_number' })
      }
      if (!secure_token) return res.status(401).json({ error: "A participant token is required" })
      const { data: authenticatedParticipant, error: participantAuthError } = await supabase
        .from("participants")
        .select("id,assigned_number")
        .eq("match_id", match_id)
        .eq("secure_token", secure_token)
        .single()
      if (participantAuthError || !authenticatedParticipant || Number(authenticatedParticipant.assigned_number) !== Number(assigned_number)) {
        return res.status(401).json({ error: "Invalid participant token" })
      }
      
      // Check for either survey data, summary, or feedback
      if (!survey_data && !summary && !feedback) {
        console.error('❌ Missing required data: survey_data, summary, or feedback')
        return res.status(400).json({ error: 'Missing survey data, summary, or feedback' })
      }

      // Handle feedback saving
      if (feedback && round) {
        console.log('📝 Processing feedback for round:', round, 'event_id:', event_id)
        
        const {
          compatibilityRate,
          conversationQuality,
          personalConnection,
          sharedInterests,
          comfortLevel,
          communicationStyle,
          wouldMeetAgain,
          overallExperience,
          recommendations,
          organizerImpression,
          participantMessage
        } = feedback

        // Check if feedback already exists for this participant, round, and event
        const { data: existingFeedback, error: existingFeedbackError } = await supabase
          .from("match_feedback")
          .select("id")
          .eq("match_id", match_id)
          .eq("participant_number", assigned_number)
          .eq("round", round)
          .eq("event_id", event_id || 1)

        if (existingFeedbackError) {
          logError("Error checking existing feedback", existingFeedbackError)
          throw new Error("Database query failed")
        }

        const feedbackData = {
          match_id,
          participant_number: assigned_number,
          participant_token: secure_token || null,
          round,
          event_id: event_id || 1,
          compatibility_rate: compatibilityRate,
          conversation_quality: conversationQuality,
          personal_connection: personalConnection,
          shared_interests: sharedInterests,
          comfort_level: comfortLevel,
          communication_style: communicationStyle,
          would_meet_again: wouldMeetAgain,
          overall_experience: overallExperience,
          recommendations: recommendations || null,
          organizer_impression: organizerImpression || null,
          participant_message: participantMessage || null,
          submitted_at: new Date().toISOString()
        }

        if (existingFeedback && existingFeedback.length > 0) {
          // Update existing feedback
          const { error: updateFeedbackError } = await supabase
            .from("match_feedback")
            .update(feedbackData)
            .eq("match_id", match_id)
            .eq("participant_number", assigned_number)
            .eq("round", round)
            .eq("event_id", event_id || 1)

          if (updateFeedbackError) {
            logError("Error updating feedback", updateFeedbackError)
            throw new Error("Failed to update feedback")
          }
        } else {
          // Insert new feedback
          const { error: insertFeedbackError } = await supabase
            .from("match_feedback")
            .insert([feedbackData])

          if (insertFeedbackError) {
            logError("Error inserting feedback", insertFeedbackError)
            throw new Error("Failed to save feedback")
          }
        }

        console.log('✅ Feedback saved successfully')
        return res.status(200).json({ 
          success: true, 
          message: "Feedback saved successfully" 
        })
      }

      if (survey_data && (survey_data.termsAccepted !== true || survey_data.dataConsent !== true)) {
        return res.status(400).json({ error: "Explicit acceptance of the terms and privacy notice is required" })
      }

      console.log('📝 Processing participant data for assigned_number:', assigned_number)

      const phoneNumber = survey_data?.phoneNumber || survey_data?.answers?.phone_number

      // Find the participant to update using their secure_token as the primary identifier
      const { data: existing, error: existingError } = await supabase
        .from("participants")
        .select("id, assigned_number, survey_data, secure_token, phone_number")
        .eq("match_id", match_id)
        .eq("secure_token", secure_token)

      if (existingError) {
        logError("Error checking existing participant", existingError)
        throw existingError
      }

      const currentParticipant = existing?.[0] || null
      const hasExistingSurvey = currentParticipant?.survey_data != null
      phoneConflictRequiresOtp = !hasExistingSurvey

      // Duplicate-account recovery is a registration concern. An authenticated
      // survey edit with the same canonical phone skips the ownership lookup;
      // a genuine phone identity change remains protected by this check and by
      // the database trigger that closes the check/update race window.
      if (phoneNumber) {
        if (!isPlausibleParticipantPhone(phoneNumber)) {
          return res.status(400).json({
            code: "INVALID_PHONE_NUMBER",
            error: "رقم الجوال غير صحيح",
          })
        }

        const shouldCheckPhoneOwnership = shouldCheckParticipantPhoneOwnership({
          hasExistingSurvey,
          currentPhone: currentParticipant?.phone_number,
          nextPhone: phoneNumber,
        })

        if (shouldCheckPhoneOwnership) {
          const { participants: phoneOwners, error: phoneOwnerError } = await findParticipantsByExactPhone(
            phoneNumber,
            "id, assigned_number, phone_number, secure_token, created_at"
          )
          if (phoneOwnerError) {
            logError("Error checking phone owner", phoneOwnerError)
            throw phoneOwnerError
          }

          const currentParticipantId = currentParticipant?.id || null
          const otherOwners = phoneOwners.filter(owner => owner.id !== currentParticipantId)
          if (otherOwners.length > 0) {
            return res.status(409).json({
              code: "PHONE_ALREADY_REGISTERED",
              duplicate: true,
              requires_otp: phoneConflictRequiresOtp,
              error: "رقم الجوال مرتبط بحساب موجود",
              message: phoneConflictRequiresOtp
                ? "سنرسل رمز تحقق لتسجيل دخولك إلى حسابك الحالي."
                : "استخدم رقم جوال غير مرتبط بحساب آخر.",
            })
          }
        }
      }

      const updateFields = {}

      // Handle survey data (only if present)
      if (survey_data) {
        console.log('📊 Processing validated survey data')
        
        const rawAnswers = req.body.survey_data?.answers || {};
        const profileValidation = validateProfileDataCollection(rawAnswers, { requireAll: false })
        if (!profileValidation.valid) {
          return res.status(400).json({ error: 'Invalid profile data collection answers', fields: profileValidation.errors })
        }
        const answers = { ...rawAnswers, ...profileValidation.answers };
        const redLinesRaw = answers.redLines;
        const redLines = Array.isArray(redLinesRaw)
          ? redLinesRaw
          : typeof redLinesRaw === "string"
            ? redLinesRaw.split(",").map(s => s.trim()).filter(Boolean)
            : [];
        
        // Prepare survey_data JSONB object according to schema
        updateFields.survey_data = {
          ...survey_data,
          answers: {
            ...answers,
            redLines,
          },
        }
        updateFields.terms_version = LEGAL_TERMS_VERSION
        updateFields.privacy_notice_version = LEGAL_PRIVACY_NOTICE_VERSION
        updateFields.consented_at = new Date().toISOString()
        updateFields.marketing_consent = survey_data.marketingConsent === true

        for (const [column, value] of Object.entries(profileValidation.answers)) {
          updateFields[column] = Number(value)
        }

        // Persist personal info to dedicated columns (extracted from answers)
        if (typeof survey_data.name === 'string' && survey_data.name.trim()) {
          updateFields.name = survey_data.name.trim()
        } else if (typeof answers.name === 'string' && answers.name.trim()) {
          updateFields.name = answers.name.trim()
        }
        
        // Handle age from answers (comes as string from form)
        const ageValue = survey_data.age || answers.age
        if (ageValue) {
          const ageNum = typeof ageValue === 'number' ? ageValue : parseInt(ageValue)
          if (!isNaN(ageNum) && ageNum >= 18 && ageNum <= 65) {
            updateFields.age = ageNum
            console.log('🎂 Age:', ageNum)
          }
        }
        
        if (typeof survey_data.gender === 'string' && survey_data.gender.trim()) {
          updateFields.gender = survey_data.gender.trim()
        } else if (typeof answers.gender === 'string' && answers.gender.trim()) {
          updateFields.gender = answers.gender.trim()
        }
        
        if (typeof survey_data.phoneNumber === 'string' && survey_data.phoneNumber.trim()) {
          updateFields.phone_number = survey_data.phoneNumber.trim()
        } else if (typeof answers.phone_number === 'string' && answers.phone_number.trim()) {
          updateFields.phone_number = answers.phone_number.trim()
        }

        // Nationality (text) and nationality preference (boolean: prefers same nationality)
        if (typeof answers.nationality === 'string' && answers.nationality.trim()) {
          updateFields.nationality = answers.nationality.trim()
          console.log('🌍 Nationality:', updateFields.nationality)
        }
        if (typeof answers.nationality_preference === 'string') {
          if (answers.nationality_preference === 'same') {
            updateFields.prefer_same_nationality = true
          } else if (answers.nationality_preference === 'any') {
            updateFields.prefer_same_nationality = false
          }
          console.log('🤝 Nationality Preference (prefer_same_nationality):', updateFields.prefer_same_nationality)
        }

        // Preferred age range (min/max integers)
        const minPrefRaw = answers.preferred_age_min
        const maxPrefRaw = answers.preferred_age_max
        const minPref = typeof minPrefRaw === 'string' ? parseInt(minPrefRaw) : (typeof minPrefRaw === 'number' ? minPrefRaw : null)
        const maxPref = typeof maxPrefRaw === 'string' ? parseInt(maxPrefRaw) : (typeof maxPrefRaw === 'number' ? maxPrefRaw : null)
        // Open age preference (optional)
        if (answers.open_age_preference !== undefined) {
          const openAge = answers.open_age_preference === true || answers.open_age_preference === 'true'
          updateFields.open_age_preference = openAge
          console.log('🟢 Open Age Preference:', openAge)
          if (openAge) {
            // Clear stored range if user opted for open age
            updateFields.preferred_age_min = null
            updateFields.preferred_age_max = null
          }
        }

        if (!isNaN(minPref) && !isNaN(maxPref)) {
          // Basic guard rails; DB will enforce too
          if (minPref >= 16 && maxPref <= 80 && minPref <= maxPref) {
            // Only persist range if NOT explicitly open age
            if (!(updateFields.open_age_preference === true)) {
              updateFields.preferred_age_min = minPref
              updateFields.preferred_age_max = maxPref
              console.log('📏 Preferred Age Range:', minPref, '-', maxPref)
            } else {
              console.log('ℹ️ Skipping saving age range because open_age_preference is true')
            }
          }
        }

        // Store the participant's explicit one-year range-expansion consent in
        // a typed column as well as survey_data JSONB. NULL preserves the
        // legacy/unanswered and open-age states.
        const ageFlexOneYearRaw = answers.age_flex_one_year
        if (ageFlexOneYearRaw !== undefined) {
          const normalizedAgeFlex = String(ageFlexOneYearRaw).trim().toLowerCase()
          if (ageFlexOneYearRaw === true || normalizedAgeFlex === 'true' || normalizedAgeFlex === 'accept' || normalizedAgeFlex === 'yes') {
            updateFields.age_flex_one_year = true
          } else if (ageFlexOneYearRaw === false || normalizedAgeFlex === 'false' || normalizedAgeFlex === 'decline' || normalizedAgeFlex === 'no') {
            updateFields.age_flex_one_year = false
          } else if (normalizedAgeFlex === 'not_applicable') {
            updateFields.age_flex_one_year = null
          }
        }
        
        // Save MBTI personality type to dedicated column (4 characters max)
        if (survey_data.mbtiType && survey_data.mbtiType.length === 4) {
          updateFields.mbti_personality_type = survey_data.mbtiType
          console.log('🧠 MBTI Type:', survey_data.mbtiType)
        }
        
        // Save attachment style to dedicated column (must match constraint values)
        if (survey_data.attachmentStyle) {
          const validAttachmentStyles = ['Secure', 'Anxious', 'Avoidant', 'Fearful']
          if (validAttachmentStyles.includes(survey_data.attachmentStyle) || 
              survey_data.attachmentStyle.startsWith('Mixed (')) {
            updateFields.attachment_style = survey_data.attachmentStyle
            console.log('🔒 Attachment Style:', survey_data.attachmentStyle)
          }
        }
        
        // Save communication style to dedicated column (must match constraint values)
        if (survey_data.communicationStyle) {
          const validCommunicationStyles = ['Assertive', 'Passive', 'Aggressive', 'Passive-Aggressive']
          if (validCommunicationStyles.includes(survey_data.communicationStyle)) {
            updateFields.communication_style = survey_data.communicationStyle
            console.log('💬 Communication Style:', survey_data.communicationStyle)
          }
        }
        
        // Handle gender preferences from new structure
        const genderPref = answers.actual_gender_preference || answers.gender_preference || answers.same_gender_preference
        let normalizedGenderPrefStr = 'opposite_gender'
        if (Array.isArray(genderPref)) {
          // Old checkbox structure: check for specific values
          updateFields.same_gender_preference = genderPref.includes('same_gender') || genderPref.includes('yes')
          updateFields.any_gender_preference = genderPref.includes('any_gender')
          console.log('👥 Same Gender Preference (old):', updateFields.same_gender_preference)
          console.log('🌐 Any Gender Preference (old):', updateFields.any_gender_preference)
          normalizedGenderPrefStr = updateFields.any_gender_preference ? 'any_gender' : (updateFields.same_gender_preference ? 'same_gender' : 'opposite_gender')
        } else if (typeof genderPref === 'string') {
          // Support both raw UI values (male|female|any) and normalized values
          if (genderPref === 'same_gender' || genderPref === 'any_gender' || genderPref === 'opposite_gender') {
            normalizedGenderPrefStr = genderPref
          } else if (genderPref === 'any') {
            normalizedGenderPrefStr = 'any_gender'
          } else if (genderPref === 'male' || genderPref === 'female') {
            const userGenderForPref = answers.gender || survey_data.gender
            normalizedGenderPrefStr = (userGenderForPref && String(userGenderForPref).toLowerCase() === genderPref)
              ? 'same_gender'
              : 'opposite_gender'
          } else {
            normalizedGenderPrefStr = 'opposite_gender'
          }

          if (normalizedGenderPrefStr === 'same_gender') {
            updateFields.same_gender_preference = true
            updateFields.any_gender_preference = false
            console.log('👥 Gender Preference: same gender only')
          } else if (normalizedGenderPrefStr === 'any_gender') {
            updateFields.same_gender_preference = false
            updateFields.any_gender_preference = true
            console.log('🌐 Gender Preference: any gender')
          } else {
            // opposite_gender or default
            updateFields.same_gender_preference = false
            updateFields.any_gender_preference = false
            console.log('👫 Gender Preference: opposite gender')
          }
        } else {
          // Default to false if not provided (opposite gender matching)
          updateFields.same_gender_preference = false
          updateFields.any_gender_preference = false
          normalizedGenderPrefStr = 'opposite_gender'
          console.log('👥 Gender Preferences (default): opposite gender matching')
        }

        // Keep the customer-facing choice in gender_preference so the edit form
        // can restore it, while actual_gender_preference remains normalized for matching.
        try {
          if (updateFields.survey_data && updateFields.survey_data.answers) {
            updateFields.survey_data.answers.actual_gender_preference = normalizedGenderPrefStr
          }
        } catch (e) {
          console.warn('⚠️ Could not persist normalized gender_preference into survey_data:', e?.message)
        }
        
        // Save interaction style preferences to dedicated columns
        const humorBanterStyle = answers.humor_banter_style
        if (humorBanterStyle && ['A', 'B', 'C', 'D'].includes(humorBanterStyle)) {
          updateFields.humor_banter_style = humorBanterStyle
          console.log('😄 Humor/Banter Style:', humorBanterStyle)
        }
        
        const earlyOpennessComfort = answers.early_openness_comfort
        if (earlyOpennessComfort !== undefined) {
          const comfortLevel = parseInt(earlyOpennessComfort)
          if (!isNaN(comfortLevel) && [0, 1, 2, 3].includes(comfortLevel)) {
            updateFields.early_openness_comfort = comfortLevel
            console.log('🤝 Early Openness Comfort:', comfortLevel)
          }
        }
        
        // NEW: Persist additional interaction & goal fields to dedicated columns
        const intentGoal = answers.intent_goal
        if (typeof intentGoal === 'string' && ['A','B','C'].includes(intentGoal)) {
          updateFields.intent_goal = intentGoal
          console.log('🎯 Intent Goal:', intentGoal)
        }

        // Persist openness to different goal (checkbox)
        const openIntentMismatchRaw = answers.open_intent_goal_mismatch
        if (openIntentMismatchRaw !== undefined) {
          const openIntentMismatch = (openIntentMismatchRaw === true || String(openIntentMismatchRaw).toLowerCase() === 'true')
          updateFields.open_intent_goal_mismatch = openIntentMismatch
          console.log('✅ Open to different goal:', openIntentMismatch)
        }

        const conversationalRole = answers.conversational_role
        if (typeof conversationalRole === 'string' && ['A','B','C'].includes(conversationalRole)) {
          updateFields.conversational_role = conversationalRole
          console.log('🗣️ Conversational Role:', conversationalRole)
        }

        const conversationDepth = answers.conversation_depth_pref
        if (typeof conversationDepth === 'string' && ['A','B'].includes(conversationDepth)) {
          updateFields.conversation_depth_pref = conversationDepth
          console.log('📚 Conversation Depth Pref:', conversationDepth)
        }

        const socialBattery = answers.social_battery
        if (typeof socialBattery === 'string' && ['A','B'].includes(socialBattery)) {
          updateFields.social_battery = socialBattery
          console.log('🔋 Social Battery:', socialBattery)
        }

        const curiosityStyle = answers.curiosity_style
        if (typeof curiosityStyle === 'string' && ['A','B','C'].includes(curiosityStyle)) {
          updateFields.curiosity_style = curiosityStyle
          console.log('🧩 Curiosity Style:', curiosityStyle)
        }

        const silenceComfort = answers.silence_comfort
        if (typeof silenceComfort === 'string' && ['A','B'].includes(silenceComfort)) {
          updateFields.silence_comfort = silenceComfort
          console.log('🤫 Silence Comfort:', silenceComfort)
        }

        const humorSubtype = answers.humor_subtype
        if (typeof humorSubtype === 'string' && ['A','B','C','D'].includes(humorSubtype)) {
          updateFields.humor_subtype = humorSubtype
          console.log('✨ Humor Subtype:', humorSubtype)
        }

        // Note: lifestyle_preferences, core_values, vibe_description, ideal_person_description
        // are not separate columns in the schema - they should be stored in survey_data JSONB
      }

      // Allow saving summary alone or with form data
      if (summary) {
        updateFields.summary = summary
        console.log('Participant summary received')
      }

      if (Object.keys(updateFields).length === 0) {
        console.error('❌ No valid fields to save')
        return res.status(400).json({ error: "No valid fields to save" })
      }

      console.log('Saving validated participant fields', { fieldCount: Object.keys(updateFields).length })

      let existingByNumber = []
      if (existing && existing.length > 0) {
        // ✅ Update existing participant identified by their secure_token
        console.log('🔄 Updating existing participant')
        const { error: updateError } = await supabase
          .from("participants")
          .update(updateFields)
          .eq("match_id", match_id)
          .eq("secure_token", secure_token)

        if (updateError) {
          logError("Update error", updateError)
          throw updateError
        }
      } else {
        // 🔎 Fallback: check by assigned_number ONLY (match_id is same for everyone per app design)
        const { data: numberMatches, error: numberCheckErr } = await supabase
          .from("participants")
          .select("id, secure_token, survey_data")
          .eq("assigned_number", assigned_number)
          .limit(1)

        existingByNumber = numberMatches || []

        if (numberCheckErr) {
          logError("Error checking existing by assigned_number", numberCheckErr)
          throw numberCheckErr
        }

        if (existingByNumber && existingByNumber.length > 0) {
          const hadSurvey = !!existingByNumber[0]?.survey_data
          console.log(`🔄 Updating existing participant by assigned_number #${assigned_number} (previous survey_data=${hadSurvey ? 'yes' : 'no'})`)
          const { error: updateByNumberErr } = await supabase
            .from("participants")
            .update(updateFields)
            .eq("assigned_number", assigned_number)

          if (updateByNumberErr) {
            logError("Update error (by number)", updateByNumberErr)
            throw updateByNumberErr
          }
        } else {
          // ✅ Insert new when truly not existing
          console.log('➕ Inserting new participant (no existing by token or number)')
          const { error: insertError } = await supabase.from("participants").insert([
            {
              assigned_number,
              match_id,
              is_host: false,
              ...updateFields,
            },
          ])
          if (insertError) {
            logError("Insert error", insertError)
            throw insertError
          }
        }
      }

      if (survey_data && updateFields.consented_at) {
        const { data: acceptedParticipant, error: acceptedParticipantError } = await supabase
          .from("participants")
          .select("id,assigned_number,event_id")
          .eq("match_id", match_id)
          .eq("assigned_number", assigned_number)
          .maybeSingle()
        if (acceptedParticipantError) {
          logError("Survey legal acceptance participant lookup", acceptedParticipantError)
        } else if (acceptedParticipant) {
          const acceptanceRow = buildLegalAcceptanceRow(acceptedParticipant, {
            source: "survey_registration",
            eventId: acceptedParticipant.event_id,
            acceptedAt: updateFields.consented_at,
          })
          const { error: acceptanceError } = await supabase.rpc("record_participant_legal_acceptance", {
            p_participant_id: acceptanceRow.participant_id,
            p_assigned_number: acceptanceRow.assigned_number,
            p_document_bundle_version: acceptanceRow.document_bundle_version,
            p_terms_version: acceptanceRow.terms_version,
            p_privacy_notice_version: acceptanceRow.privacy_notice_version,
            p_acceptance_source: acceptanceRow.acceptance_source,
            p_event_id: acceptanceRow.event_id,
            p_accepted_at: acceptanceRow.accepted_at,
            p_document_urls: acceptanceRow.document_urls,
          })
          if (acceptanceError) {
            console.warn("Survey acceptance ledger write was unavailable", {
              code: acceptanceError.code,
              migrationRequired: acceptanceError.code === "PGRST202",
            })
          }
        }
      }

      // Log survey change history if participant re-submitted with changed answers
      try {
        const prevExisting = existing?.[0] || existingByNumber?.[0]
        const prevSurveyData = prevExisting?.survey_data
        const logNumber = prevExisting?.assigned_number || assigned_number
        if (prevSurveyData && updateFields.survey_data && logNumber) {
          const oldAnswers = prevSurveyData.answers || {}
          const newAnswers = updateFields.survey_data.answers || {}
          const allKeys = new Set([...Object.keys(oldAnswers), ...Object.keys(newAnswers)])
          const changedFields = [...allKeys].filter(k => JSON.stringify(oldAnswers[k]) !== JSON.stringify(newAnswers[k]))
          if (changedFields.length > 0) {
            const changePercentage = Math.round((changedFields.length / allKeys.size) * 100)
            const suspiciousFlags = []
            if (changedFields.includes('gender') && oldAnswers.gender && newAnswers.gender && oldAnswers.gender !== newAnswers.gender)
              suspiciousFlags.push({ level: 'high', code: 'gender_change', message: `Gender changed: ${oldAnswers.gender} → ${newAnswers.gender}` })
            const oldAge = oldAnswers.age ?? oldAnswers.ageGroup
            const newAge = newAnswers.age ?? newAnswers.ageGroup
            if (oldAge != null && newAge != null) {
              const diff = Math.abs(parseInt(newAge) - parseInt(oldAge))
              if (!isNaN(diff) && diff > 2) suspiciousFlags.push({ level: 'medium', code: 'age_change', message: `Age changed by ${diff}: ${oldAge} → ${newAge}` })
            }
            if (changedFields.includes('mbtiType') && oldAnswers.mbtiType && newAnswers.mbtiType)
              suspiciousFlags.push({ level: 'medium', code: 'mbti_change', message: `MBTI changed: ${oldAnswers.mbtiType} → ${newAnswers.mbtiType}` })
            const prevFiltered = {}, newFiltered = {}
            changedFields.forEach(k => { prevFiltered[k] = oldAnswers[k]; newFiltered[k] = newAnswers[k] })
            await supabase.from('survey_change_history').insert({
              participant_number: logNumber, match_id,
              previous_answers: prevFiltered, new_answers: newFiltered,
              changed_fields: changedFields, change_percentage: changePercentage, suspicious_flags: suspiciousFlags
            })
            console.log(`📋 Logged survey change for participant #${logNumber}: ${changedFields.length} field(s) changed (${changePercentage}%)`)
          }
        }
      } catch (histErr) { console.error('Failed to log survey change history:', histErr) }

      if (survey_data) {
        const completedAt = new Date().toISOString()
        const { error: completionError } = await supabase
          .from("survey_progress_presence")
          .update({
            is_active: false,
            completed_at: completedAt,
            last_seen_at: completedAt,
            updated_at: completedAt,
          })
          .eq("participant_id", authenticatedParticipant.id)

        if (completionError && !isSurveyProgressSchemaMissing(completionError)) {
          logError("Survey completion presence update", completionError)
        }
      }

      console.log('✅ Participant data saved successfully')
      return res.status(200).json({ message: "Saved", match_id })
    } catch (err) {
      logError("Server Error", err)
      if (err?.code === "23505" && String(err?.message || "").includes("phone")) {
        return res.status(409).json({
          code: "PHONE_ALREADY_REGISTERED",
          duplicate: true,
          requires_otp: phoneConflictRequiresOtp,
          error: "رقم الجوال مرتبط بحساب موجود",
          message: phoneConflictRequiresOtp
            ? "سنرسل رمز تحقق لتسجيل دخولك إلى حسابك الحالي."
            : "استخدم رقم جوال غير مرتبط بحساب آخر.",
        })
      }
      return res.status(500).json({ error: err.message || "Unexpected error" })
    }
  }

  // GET MATCH RESULTS BY TOKEN ACTION
  if (action === "get-match-results") {
    console.log("[API] Action: get-match-results started");
    if (!req.body.secure_token) {
      console.log("[API] Error: Missing secure_token");
      return res.status(400).json({ error: 'Missing secure_token' });
    }
    
    try {
      // First, resolve the token to get participant info including their match_id and event_id
      const { data: participant, error: participantError } = await supabase
        .from("participants")
        .select("assigned_number, match_id, event_id")
        .eq("secure_token", req.body.secure_token)
        .single();

      console.log("[API] Participant lookup completed", { found: Boolean(participant), hasError: Boolean(participantError) });

      if (participantError || !participant) {
        console.log("[API] Error: Participant not found or DB error.");
        return res.status(404).json({ 
          success: false, 
          error: 'المشارك غير موجود أو الرمز غير صحيح' 
        });
      }

      const resultsEventFormat = await loadEvent3Format(
        supabase,
        "00000000-0000-0000-0000-000000000003",
        participant.event_id,
      )

      // Fetch match results for this participant number across ALL events - only show results for finished events
      console.log(`[API] Fetching match results for participant #${participant.assigned_number} across all finished events`);
      const { data: matches, error: matchError } = await supabase
        .from("match_results")
        .select("*")
        .eq("match_id", participant.match_id)
        .eq("event_finished", true)
        .or(`participant_a_number.eq.${participant.assigned_number},participant_b_number.eq.${participant.assigned_number}`)
        .order("event_id", { ascending: false })
        .order("created_at", { ascending: false });

      console.log("[API] Match results query completed", { count: matches?.length || 0, hasError: Boolean(matchError) });

      if (matchError) {
        console.error("[API] Error fetching match results:", matchError);
        return res.status(500).json({ 
          success: false, 
          error: 'حدث خطأ أثناء جلب نتائج المطابقة' 
        });
      }

      // Filter out old match_results entries with event_id >= 20 — those are now handled by Event 3 code path
      const filteredMatches = (matches || []).filter(m => !(m.event_id && m.event_id >= 20));

      // Format the match results and fetch partner information
      const history = await Promise.all(filteredMatches.map(async (match) => {
        // Determine which participant is the partner
        const isParticipantA = match.participant_a_number === participant.assigned_number
        const partnerNumber = isParticipantA ? match.participant_b_number : match.participant_a_number
        const wantsMatch = isParticipantA ? match.participant_a_wants_match : match.participant_b_wants_match
        const partnerWantsMatch = isParticipantA ? match.participant_b_wants_match : match.participant_a_wants_match
        const effectiveRound = (match.round ?? 1)
        const effectiveEventId = (match.event_id ?? 1)
        const scoreSnapshotBreakdown = participantBreakdownFromScoreSnapshot(match.score_snapshot, {
          scoreModelVersion: match.score_model_version,
          scoreContentHash: match.score_content_hash,
          storedTotal: match.compatibility_score,
        })
        
        // Fetch partner information from the same match_id
        let partnerInfo = null
        let partnerMessage = null
        let myFeedback = null
        if (partnerNumber && partnerNumber !== 9999) {
          try {
            const { data: partnerData, error: partnerError } = await supabase
              .from("participants")
              .select("name, age, phone_number, event_id")
              .eq("assigned_number", partnerNumber)
              .eq("match_id", match.match_id)  // Use the match's match_id to get partner from correct match
              .single()
            
            if (!partnerError && partnerData) {
              partnerInfo = partnerData
            }
          } catch (err) {
            console.log(`[API] Could not fetch partner info for #${partnerNumber}:`, err)
          }

          // Fetch partner's message from match_feedback
          try {
            const tryEventIds = [effectiveEventId, participant.event_id].filter(
              (v, i, arr) => typeof v === 'number' && v > 0 && arr.indexOf(v) === i
            )

            let msgRow = null
            for (const evId of tryEventIds) {
              const { data: fbRows, error: fbErr } = await supabase
                .from('match_feedback')
                .select('participant_message, submitted_at')
                .eq('match_id', match.match_id)
                .eq('participant_number', partnerNumber)
                .eq('round', effectiveRound)
                .eq('event_id', evId)
                .order('submitted_at', { ascending: false })
                .limit(1)

              if (!fbErr && Array.isArray(fbRows) && fbRows[0]) {
                msgRow = fbRows[0]
                break
              }
            }

            if (!msgRow) {
              const { data: fbRows, error: fbErr } = await supabase
                .from('match_feedback')
                .select('participant_message, submitted_at')
                .eq('match_id', match.match_id)
                .eq('participant_number', partnerNumber)
                .eq('round', effectiveRound)
                .order('submitted_at', { ascending: false })
                .limit(1)

              if (!fbErr && Array.isArray(fbRows) && fbRows[0]) {
                msgRow = fbRows[0]
              }
            }

            if (msgRow?.participant_message) partnerMessage = msgRow.participant_message
          } catch (err) {
            console.log(`[API] Could not fetch partner message for #${partnerNumber}:`, err)
          }
        }

        try {
          const columns = 'compatibility_rate, conversation_quality, personal_connection, shared_interests, comfort_level, communication_style, would_meet_again, overall_experience, recommendations, participant_message, submitted_at'
          const tryEventIds = [effectiveEventId, participant.event_id].filter(
            (v, i, arr) => typeof v === 'number' && v > 0 && arr.indexOf(v) === i
          )

          let myFbRow = null
          for (const evId of tryEventIds) {
            const { data: rows, error: e } = await supabase
              .from('match_feedback')
              .select(columns)
              .eq('match_id', match.match_id)
              .eq('participant_number', participant.assigned_number)
              .eq('round', effectiveRound)
              .eq('event_id', evId)
              .order('submitted_at', { ascending: false })
              .limit(1)

            if (!e && Array.isArray(rows) && rows[0]) {
              myFbRow = rows[0]
              break
            }
          }

          if (!myFbRow) {
            const { data: rows, error: e } = await supabase
              .from('match_feedback')
              .select(columns)
              .eq('match_id', match.match_id)
              .eq('participant_number', participant.assigned_number)
              .eq('round', effectiveRound)
              .order('submitted_at', { ascending: false })
              .limit(1)

            if (!e && Array.isArray(rows) && rows[0]) {
              myFbRow = rows[0]
            }
          }

          if (myFbRow) {
            myFeedback = {
              compatibilityRate: myFbRow.compatibility_rate ?? null,
              conversationQuality: myFbRow.conversation_quality ?? null,
              personalConnection: myFbRow.personal_connection ?? null,
              sharedInterests: myFbRow.shared_interests ?? null,
              comfortLevel: myFbRow.comfort_level ?? null,
              communicationStyle: myFbRow.communication_style ?? null,
              wouldMeetAgain: myFbRow.would_meet_again ?? null,
              overallExperience: myFbRow.overall_experience ?? null,
              recommendations: myFbRow.recommendations ?? null,
              participantMessage: myFbRow.participant_message ?? null,
              submittedAt: myFbRow.submitted_at ?? null
            }
          }
        } catch (err) {
          console.log(`[API] Could not fetch participant feedback for #${participant.assigned_number}:`, err)
        }
        
        // Calculate mutual match based on current wants_match values
        const isMutualMatch = wantsMatch === true && partnerWantsMatch === true
        
        console.log(`[API] Match with #${partnerNumber}: wantsMatch=${wantsMatch}, partnerWantsMatch=${partnerWantsMatch}, isMutualMatch=${isMutualMatch}`)
        
        return {
          with: partnerNumber === 9999 ? "المنظم" : partnerNumber,
          partner_name: partnerNumber === 9999 ? "المنظم" : (partnerInfo?.name || `لاعب رقم ${partnerNumber}`),
          partner_age: partnerInfo?.age || null,
          partner_phone: partnerInfo?.phone_number || null,
          partner_event_id: partnerInfo?.event_id || null,
          type: match.match_type || "غير محدد",
          reason: match.reason || "السبب غير متوفر",
          round: effectiveRound,
          table_number: match.table_number,
          score: match.compatibility_score ?? scoreSnapshotBreakdown?.total ?? 0,
          score_model_version: scoreSnapshotBreakdown ? (match.score_model_version ?? null) : null,
          score_content_hash: scoreSnapshotBreakdown ? (match.score_content_hash ?? null) : null,
          score_snapshot: scoreSnapshotBreakdown ? (match.score_snapshot ?? null) : null,
          score_provenance_valid: !!scoreSnapshotBreakdown,
          breakdown: scoreSnapshotBreakdown,
          is_repeat_match: match.is_repeat_match || false,
          mutual_match: isMutualMatch,
          wants_match: wantsMatch,
          partner_wants_match: partnerWantsMatch,
          created_at: match.created_at,
          ai_personality_analysis: match.ai_personality_analysis || null,
          event_id: effectiveEventId,
          partner_message: partnerMessage,
          my_feedback: myFeedback,
          humor_early_openness_bonus: match.humor_early_openness_bonus || 'none',
          // New model numeric fields (if available in DB)
          synergy_score: match.synergy_score ?? null,
          humor_open_score: match.humor_open_score ?? null,
          intent_score: match.intent_score ?? null,
          communication_compatibility_score: match.communication_compatibility_score ?? null,
          lifestyle_compatibility_score: match.lifestyle_compatibility_score ?? null,
          core_values_compatibility_score: match.core_values_compatibility_score ?? null,
          vibe_compatibility_score: match.vibe_compatibility_score ?? null
        }
      }));

      // ── Fetch Event 3 (5.0) matches across ALL events ──
      // Visibility is governed by the master `results_visible` toggle (checked by the
      // frontend before calling this endpoint), NOT by the live event3 phase. This ensures
      // participants from past event3 events (e.g. 20) still see their results even after
      // the admin starts a new event (21) or moves the phase away from final_reveal.
      try {
        const E3_MATCH_ID = "00000000-0000-0000-0000-000000000003"
        const MAIN_MATCH = "00000000-0000-0000-0000-000000000000"

        // Get event3 state to avoid leaking matches before the final reveal.
        const { data: e3State } = await supabase
          .from("event_state")
          .select("phase,current_event_id,results_visible,test_mode_active")
          .eq("match_id", E3_MATCH_ID)
          .maybeSingle()

        const e3Finished = e3State?.phase === "final_reveal" || e3State?.results_visible === true
        const hiddenTestEventId = e3State?.test_mode_active === true
          ? Number(e3State?.current_event_id)
          : null
        console.log(`[resolve-token] Event3 state for #${participant.assigned_number}:`, { phase: e3State?.phase, results_visible: e3State?.results_visible, e3Finished })

        if (e3Finished) {
          // Fetch ALL of this participant's event3 matches (one row per event_id).
          // The `match_preference` column may not be applied yet in some DBs, so we try the
          // full query first and fall back to the same query without that column.
          let e3Matches = null
          let e3MatchErr = null
          try {
            const { data, error } = await supabase
              .from("event3_matches")
              .select("event_id,phase2_partner,phase2_score,phase2_score_model_version,phase2_score_content_hash,phase2_score_snapshot,phase2_word,phase2_feedback,phase3_partner,phase3_score,phase3_score_model_version,phase3_score_content_hash,phase3_score_snapshot,phase3_word,phase3_feedback,phase4_partner,phase4_word,phase4_feedback,match_preference")
              .eq("match_id", E3_MATCH_ID)
              .eq("participant_number", participant.assigned_number)
            e3Matches = data
            e3MatchErr = error
          } catch (err) {
            e3MatchErr = err
          }
          console.log(`[resolve-token] Event3 matches loaded`, { count: e3Matches?.length || 0, hasError: Boolean(e3MatchErr) })
          if (e3MatchErr) {
            console.error("[API] Event3 matches query (with match_preference) error:", e3MatchErr.message)
            const { data: fbData, error: fbErr } = await supabase
              .from("event3_matches")
              .select("event_id,phase2_partner,phase2_score,phase2_word,phase2_feedback,phase3_partner,phase3_score,phase3_word,phase3_feedback")
              .eq("match_id", E3_MATCH_ID)
              .eq("participant_number", participant.assigned_number)
            e3Matches = fbData
            e3MatchErr = fbErr
          }

          if (e3MatchErr) console.error("[API] Event3 matches query error:", e3MatchErr.message)

        if (hiddenTestEventId) {
          e3Matches = (e3Matches || []).filter(match => Number(match.event_id) !== hiddenTestEventId)
        }
        if (e3Matches && e3Matches.length > 0) {
          // Collect every partner number across all events for a single participants lookup.
          const allPartnerNums = [...new Set(
            e3Matches.flatMap(m => [m.phase2_partner, m.phase3_partner, m.phase4_partner]).filter(Boolean)
          )]

          const partnerMap = {}
          if (allPartnerNums.length > 0) {
            const { data: partners } = await supabase
              .from("participants")
              .select("assigned_number,name,age,phone_number,survey_data")
              .eq("match_id", MAIN_MATCH)
              .in("assigned_number", allPartnerNums)
            for (const p of partners || []) {
              const sd = typeof p.survey_data === "string" ? JSON.parse(p.survey_data || "{}") : (p.survey_data || {})
              partnerMap[p.assigned_number] = {
                name: p.name || sd?.answers?.name || sd?.name || `#${p.assigned_number}`,
                age: p.age || null,
                phone: p.phone_number || null,
              }
            }
          }

          // Build history entries for each event the participant took part in.
          for (const e3Match of e3Matches) {
            const evId = e3Match.event_id || 20
            const historicalEventFormat = await loadEvent3Format(supabase, E3_MATCH_ID, evId)
            const isChoiceOnlyHistory = historicalEventFormat === "choice_only_three_groups"

            // Fetch partner feedback (scoped to same event) for mutual-match computation
            let p2PartnerFb = null, p3PartnerFb = null, p4PartnerFb = null
            if (e3Match.phase2_partner) {
              const { data: p2Row } = await supabase.from("event3_matches").select("phase2_feedback").eq("match_id", E3_MATCH_ID).eq("event_id", evId).eq("participant_number", e3Match.phase2_partner).maybeSingle()
              p2PartnerFb = p2Row?.phase2_feedback || null
            }
            if (e3Match.phase3_partner) {
              const { data: p3Row } = await supabase.from("event3_matches").select("phase3_feedback").eq("match_id", E3_MATCH_ID).eq("event_id", evId).eq("participant_number", e3Match.phase3_partner).maybeSingle()
              p3PartnerFb = p3Row?.phase3_feedback || null
            }
            if (isChoiceOnlyHistory && e3Match.phase4_partner) {
              const { data: p4Row } = await supabase.from("event3_matches").select("phase4_feedback").eq("match_id", E3_MATCH_ID).eq("event_id", evId).eq("participant_number", e3Match.phase4_partner).maybeSingle()
              p4PartnerFb = p4Row?.phase4_feedback || null
            }

            // Add Phase 2 (Choice) match
            if (e3Match.phase2_partner) {
              const p2Partner = partnerMap[e3Match.phase2_partner]
              const p2Breakdown = isChoiceOnlyHistory ? null : participantBreakdownFromScoreSnapshot(e3Match.phase2_score_snapshot, {
                scoreModelVersion: e3Match.phase2_score_model_version,
                scoreContentHash: e3Match.phase2_score_content_hash,
                storedTotal: e3Match.phase2_score,
              })
              const myFb2 = e3Match.phase2_feedback || null
              const partnerFb2 = p2PartnerFb
              const myWant2 = myFb2?.wantConnect ?? null
              const partnerWant2 = partnerFb2?.wantConnect ?? null
              const contact2 = buildEvent3MutualContactShare({
                myFeedback: myFb2,
                partnerFeedback: partnerFb2,
                partnerPhone: p2Partner?.phone,
              })
              history.push({
                with: e3Match.phase2_partner,
                partner_name: p2Partner?.name || `لاعب رقم ${e3Match.phase2_partner}`,
                partner_age: p2Partner?.age || null,
                ...contact2,
                partner_event_id: evId,
                type: "choice",
                reason: isChoiceOnlyHistory ? "أقوى اختيار متبادل في ترتيبكما" : formatParticipantBreakdownReason(p2Breakdown),
                round: 20,
                table_number: null,
                score: isChoiceOnlyHistory ? null : e3Match.phase2_score ?? p2Breakdown?.total ?? 0,
                score_model_version: p2Breakdown ? (e3Match.phase2_score_model_version ?? null) : null,
                score_content_hash: p2Breakdown ? (e3Match.phase2_score_content_hash ?? null) : null,
                score_snapshot: p2Breakdown ? (e3Match.phase2_score_snapshot ?? null) : null,
                score_provenance_valid: !!p2Breakdown,
                is_repeat_match: false,
                wants_match: myWant2,
                partner_wants_match: partnerWant2 ?? null,
                created_at: null,
                ai_personality_analysis: null,
                event_id: evId,
                event_format: historicalEventFormat,
                partner_message: null,
                match_type: "choice",
                match_label: isChoiceOnlyHistory ? "اختيارك الأول" : "اختيارك الشخصي",
                match_word: e3Match.phase2_word || null,
                breakdown: p2Breakdown,
                match_preference: e3Match.match_preference || null,
                my_feedback: myFb2 ? {
                  compatibilityRate: myFb2.compatibilityRate ?? null,
                  conversationQuality: myFb2.conversationQuality ?? null,
                  personalConnection: myFb2.personalConnection ?? null,
                  sharedInterests: myFb2.sharedInterests ?? null,
                  comfortLevel: myFb2.comfortLevel ?? null,
                  communicationStyle: myFb2.communicationStyle ?? null,
                  wouldMeetAgain: myFb2.wouldMeetAgain ?? null,
                  overallExperience: myFb2.overallExperience ?? null,
                  recommendations: myFb2.recommendations ?? null,
                  organizerImpression: myFb2.organizerImpression ?? null,
                  submittedAt: null,
                  wantConnect: myFb2.wantConnect ?? null,
                  sliderMoved: myFb2.sliderMoved ?? false,
                } : null,
                partner_feedback: partnerFb2 ? {
                  conversationQuality: partnerFb2.conversationQuality ?? null,
                  personalConnection: partnerFb2.personalConnection ?? null,
                  overallExperience: partnerFb2.overallExperience ?? null,
                  wantConnect: partnerFb2.wantConnect ?? null,
                  compatibilityRate: partnerFb2.compatibilityRate ?? null,
                  sliderMoved: partnerFb2.sliderMoved ?? null,
                  organizerImpression: partnerFb2.organizerImpression ?? null,
                } : null,
                humor_early_openness_bonus: "none",
                synergy_score: p2Breakdown?.synergy ?? null,
                humor_open_score: p2Breakdown?.humorOpen ?? null,
                intent_score: p2Breakdown?.intent ?? null,
                communication_compatibility_score: p2Breakdown?.communication ?? null,
                lifestyle_compatibility_score: p2Breakdown?.lifestyle ?? null,
                vibe_compatibility_score: p2Breakdown?.vibe ?? null,
              })
            }

            // Add Phase 3 (Algorithm) match
            if (e3Match.phase3_partner) {
              const p3Partner = partnerMap[e3Match.phase3_partner]
              const p3Breakdown = isChoiceOnlyHistory ? null : participantBreakdownFromScoreSnapshot(e3Match.phase3_score_snapshot, {
                scoreModelVersion: e3Match.phase3_score_model_version,
                scoreContentHash: e3Match.phase3_score_content_hash,
                storedTotal: e3Match.phase3_score,
              })
              const myFb3 = e3Match.phase3_feedback || null
              const partnerFb3 = p3PartnerFb
              const myWant3 = myFb3?.wantConnect ?? null
              const partnerWant3 = partnerFb3?.wantConnect ?? null
              const contact3 = buildEvent3MutualContactShare({
                myFeedback: myFb3,
                partnerFeedback: partnerFb3,
                partnerPhone: p3Partner?.phone,
              })
              history.push({
                with: e3Match.phase3_partner,
                partner_name: p3Partner?.name || `لاعب رقم ${e3Match.phase3_partner}`,
                partner_age: p3Partner?.age || null,
                ...contact3,
                partner_event_id: evId,
                type: "algorithm",
                reason: isChoiceOnlyHistory ? "أقوى اختيار متبادل متبقٍ بعد استبعاد شريك اللقاء الأول" : formatParticipantBreakdownReason(p3Breakdown),
                round: 21,
                table_number: null,
                score: isChoiceOnlyHistory ? null : e3Match.phase3_score ?? p3Breakdown?.total ?? 0,
                score_model_version: p3Breakdown ? (e3Match.phase3_score_model_version ?? null) : null,
                score_content_hash: p3Breakdown ? (e3Match.phase3_score_content_hash ?? null) : null,
                score_snapshot: p3Breakdown ? (e3Match.phase3_score_snapshot ?? null) : null,
                score_provenance_valid: !!p3Breakdown,
                is_repeat_match: false,
                wants_match: myWant3,
                partner_wants_match: partnerWant3 ?? null,
                created_at: null,
                ai_personality_analysis: null,
                event_id: evId,
                event_format: historicalEventFormat,
                partner_message: null,
                match_type: "algorithm",
                match_label: isChoiceOnlyHistory ? "اختيارك الثاني" : "اختيار الخوارزمية",
                match_word: e3Match.phase3_word || null,
                breakdown: p3Breakdown,
                match_preference: e3Match.match_preference || null,
                my_feedback: myFb3 ? {
                  compatibilityRate: myFb3.compatibilityRate ?? null,
                  conversationQuality: myFb3.conversationQuality ?? null,
                  personalConnection: myFb3.personalConnection ?? null,
                  sharedInterests: myFb3.sharedInterests ?? null,
                  comfortLevel: myFb3.comfortLevel ?? null,
                  communicationStyle: myFb3.communicationStyle ?? null,
                  wouldMeetAgain: myFb3.wouldMeetAgain ?? null,
                  overallExperience: myFb3.overallExperience ?? null,
                  recommendations: myFb3.recommendations ?? null,
                  organizerImpression: myFb3.organizerImpression ?? null,
                  submittedAt: null,
                  wantConnect: myFb3.wantConnect ?? null,
                  sliderMoved: myFb3.sliderMoved ?? false,
                } : null,
                partner_feedback: partnerFb3 ? {
                  conversationQuality: partnerFb3.conversationQuality ?? null,
                  personalConnection: partnerFb3.personalConnection ?? null,
                  overallExperience: partnerFb3.overallExperience ?? null,
                  wantConnect: partnerFb3.wantConnect ?? null,
                  compatibilityRate: partnerFb3.compatibilityRate ?? null,
                  sliderMoved: partnerFb3.sliderMoved ?? null,
                  organizerImpression: partnerFb3.organizerImpression ?? null,
                } : null,
                humor_early_openness_bonus: "none",
                synergy_score: p3Breakdown?.synergy ?? null,
                humor_open_score: p3Breakdown?.humorOpen ?? null,
                intent_score: p3Breakdown?.intent ?? null,
                communication_compatibility_score: p3Breakdown?.communication ?? null,
                lifestyle_compatibility_score: p3Breakdown?.lifestyle ?? null,
                vibe_compatibility_score: p3Breakdown?.vibe ?? null,
              })
            }

            if (isChoiceOnlyHistory && e3Match.phase4_partner) {
              const p4Partner = partnerMap[e3Match.phase4_partner]
              const myFb4 = e3Match.phase4_feedback || null
              const partnerFb4 = p4PartnerFb
              const myWant4 = myFb4?.wantConnect ?? null
              const partnerWant4 = partnerFb4?.wantConnect ?? null
              const contact4 = buildEvent3MutualContactShare({
                myFeedback: myFb4,
                partnerFeedback: partnerFb4,
                partnerPhone: p4Partner?.phone,
              })
              history.push({
                with: e3Match.phase4_partner,
                partner_name: p4Partner?.name || `لاعب رقم ${e3Match.phase4_partner}`,
                partner_age: p4Partner?.age || null,
                ...contact4,
                partner_event_id: evId,
                type: "third_choice",
                reason: "أقوى اختيار متبادل متبقٍ بعد استبعاد شريكي اللقاءين السابقين",
                round: 22,
                table_number: null,
                score: null,
                score_model_version: null,
                score_content_hash: null,
                score_snapshot: null,
                score_provenance_valid: false,
                is_repeat_match: false,
                wants_match: myWant4,
                partner_wants_match: partnerWant4 ?? null,
                created_at: null,
                ai_personality_analysis: null,
                event_id: evId,
                event_format: historicalEventFormat,
                partner_message: null,
                match_type: "third_choice",
                match_label: "اختيارك الثالث",
                match_word: e3Match.phase4_word || null,
                breakdown: null,
                match_preference: e3Match.match_preference || null,
                my_feedback: myFb4 ? {
                  compatibilityRate: myFb4.compatibilityRate ?? null,
                  conversationQuality: myFb4.conversationQuality ?? null,
                  personalConnection: myFb4.personalConnection ?? null,
                  sharedInterests: myFb4.sharedInterests ?? null,
                  comfortLevel: myFb4.comfortLevel ?? null,
                  communicationStyle: myFb4.communicationStyle ?? null,
                  wouldMeetAgain: myFb4.wouldMeetAgain ?? null,
                  overallExperience: myFb4.overallExperience ?? null,
                  recommendations: myFb4.recommendations ?? null,
                  organizerImpression: myFb4.organizerImpression ?? null,
                  submittedAt: null,
                  wantConnect: myFb4.wantConnect ?? null,
                  sliderMoved: myFb4.sliderMoved ?? false,
                } : null,
                partner_feedback: partnerFb4 ? {
                  conversationQuality: partnerFb4.conversationQuality ?? null,
                  personalConnection: partnerFb4.personalConnection ?? null,
                  overallExperience: partnerFb4.overallExperience ?? null,
                  wantConnect: partnerFb4.wantConnect ?? null,
                  compatibilityRate: partnerFb4.compatibilityRate ?? null,
                  sliderMoved: partnerFb4.sliderMoved ?? null,
                  organizerImpression: partnerFb4.organizerImpression ?? null,
                } : null,
                humor_early_openness_bonus: "none",
                synergy_score: null,
                humor_open_score: null,
                intent_score: null,
                communication_compatibility_score: null,
                lifestyle_compatibility_score: null,
                vibe_compatibility_score: null,
              })
            }
          }
        }
        }
      } catch (e3Err) {
        console.log("[API] Event3 matches fetch skipped:", e3Err.message)
      }

      console.log(`[API] Successfully fetched match results for #${participant.assigned_number}. History count: ${history.length}`);
      return res.status(200).json({
        success: true,
        assigned_number: participant.assigned_number,
        event_id: participant.event_id,
        event_format: resultsEventFormat,
        history: history.map(protectPartnerPrivacy)
      });

    } catch (error) {
      console.error("[API] Unexpected error in get-match-results:", error);
      return res.status(500).json({ 
        success: false, 
        error: 'حدث خطأ غير متوقع' 
      });
    }
  }

  // CHECK FEEDBACK SUBMITTED ACTION
  if (action === "check-feedback-submitted") {
    try {
      const { secure_token, round, event_id } = req.body
      const match_id = process.env.CURRENT_MATCH_ID || "00000000-0000-0000-0000-000000000000"

      if (!secure_token || !round || !event_id) {
        return res.status(400).json({ error: 'Missing required parameters' })
      }

      // Check if feedback exists for this token, round, and event
      const { data: feedbackData, error: feedbackError } = await supabase
        .from("match_feedback")
        .select("id")
        .eq("match_id", match_id)
        .eq("participant_token", secure_token)
        .eq("round", round)
        .eq("event_id", event_id)

      if (feedbackError) {
        console.error("Error checking feedback:", feedbackError)
        return res.status(500).json({ error: "Database error" })
      }

      // REMOVED AUTOMATIC LOGIC: Event finished status is now ONLY controlled by manual admin toggle
      // No longer automatically marking events as finished based on current_event_id
      
      // Check the event_finished flag in match_results
      const { data: matchData, error: matchError } = await supabase
        .from("match_results")
        .select("event_finished")
        .eq("event_id", event_id)
        .eq("round", round)
        .limit(1)
        .single()

      if (matchError && matchError.code !== 'PGRST116') {
        console.error("Error checking event status:", matchError)
        return res.status(500).json({ error: "Database error" })
      }

      const eventFinished = matchData?.event_finished === true
      
      const feedbackSubmitted = feedbackData && feedbackData.length > 0

      return res.status(200).json({
        success: true,
        event_finished: eventFinished,
        feedback_submitted: feedbackSubmitted
      })
    } catch (error) {
      console.error("Error checking feedback status:", error)
      return res.status(500).json({ error: "Failed to check feedback status" })
    }
  }

  // CHECK IF PARTICIPANT HAS A VALID MATCH (not organizer #9999) FOR A GIVEN ROUND
  // Accepts optional `round` parameter (defaults to 1 for backwards compatibility).
  if (action === "has-valid-match") {
    try {
      const { secure_token, event_id: inputEventId, round: inputRound } = req.body
      const match_id = process.env.CURRENT_MATCH_ID || "00000000-0000-0000-0000-000000000000"
      const targetRound = (typeof inputRound === 'number' && inputRound > 0) ? inputRound : (parseInt(inputRound) || 1)

      if (!secure_token) {
        return res.status(400).json({ error: "Missing secure_token" })
      }

      // Resolve participant
      const { data: participant, error: participantError } = await supabase
        .from("participants")
        .select("assigned_number, event_id")
        .eq("secure_token", secure_token)
        .eq("match_id", match_id)
        .single()

      if (participantError || !participant) {
        return res.status(404).json({ success: false, error: "Participant not found" })
      }

      // Determine target event_id (request > participant > event_state > 1)
      let eventId = inputEventId || participant.event_id || 1
      if (!inputEventId && !participant.event_id) {
        try {
          const { data: eventState } = await supabase
            .from("event_state")
            .select("current_event_id")
            .eq("match_id", match_id)
            .single()
          if (eventState?.current_event_id) {
            eventId = eventState.current_event_id
          }
        } catch (_) {}
      }

      // Look for any match in the requested round with a real partner (not 9999)
      const { data: matches, error: matchesError } = await supabase
        .from("match_results")
        .select("participant_a_number, participant_b_number")
        .eq("match_id", match_id)
        .eq("event_id", eventId)
        .eq("round", targetRound)
        .or(`participant_a_number.eq.${participant.assigned_number},participant_b_number.eq.${participant.assigned_number}`)
        .limit(20)

      if (matchesError) {
        console.error("Error checking matches:", matchesError)
        return res.status(500).json({ success: false, error: "Database error" })
      }

      const has_valid_match = Array.isArray(matches) && matches.some(m => {
        const partner = m.participant_a_number === participant.assigned_number
          ? m.participant_b_number
          : m.participant_a_number
        return partner && partner !== 9999
      })

      return res.status(200).json({ success: true, has_valid_match })
    } catch (error) {
      console.error("Error in has-valid-match:", error)
      return res.status(500).json({ success: false, error: "Unexpected error" })
    }
  }

  // CHECK PHONE NUMBER DUPLICATE (for survey validation)
  if (action === "check-phone-duplicate") {
    const { phone_number, secure_token } = req.body

    if (!phone_number) {
      return res.status(400).json({ error: "Phone number is required" })
    }

    try {
      if (!isPlausibleParticipantPhone(phone_number)) {
        return res.status(400).json({
          code: "INVALID_PHONE_NUMBER",
          error: "رقم الجوال غير صحيح",
        })
      }

      let currentParticipantId = null
      if (secure_token) {
        const { data: currentParticipant, error: currentError } = await supabase
          .from("participants")
          .select("id, survey_data")
          .eq("match_id", process.env.CURRENT_MATCH_ID || STATIC_MATCH_ID)
          .eq("secure_token", secure_token)
          .maybeSingle()
        if (currentError) {
          console.error("Current participant lookup failed:", currentError)
          return res.status(500).json({ error: "Database error" })
        }
        currentParticipantId = currentParticipant?.id || null
        if (currentParticipant?.survey_data != null) {
          return res.status(200).json({
            duplicate: false,
            skipped: true,
            reason: "survey_edit",
            message: "تم تجاوز فحص التسجيل لتعديل الاستبيان",
          })
        }
      }

      const { participants, error } = await findParticipantsByExactPhone(
        phone_number,
        "id, assigned_number, phone_number, created_at"
      )
      if (error) {
        console.error("Exact phone lookup failed:", error)
        return res.status(500).json({ error: "Database error" })
      }

      const matchingParticipants = participants.filter(participant => participant.id !== currentParticipantId)

      if (matchingParticipants.length > 0) {
        return res.status(409).json({ 
          code: "PHONE_ALREADY_REGISTERED",
          duplicate: true,
          requires_otp: true,
          error: "رقم الجوال مرتبط بحساب موجود",
          message: "سنرسل رمز تحقق لتسجيل دخولك إلى حسابك الحالي.",
        })
      }

      return res.status(200).json({ 
        duplicate: false,
        message: "رقم الجوال متاح"
      })

    } catch (error) {
      console.error("Error checking phone duplicate:", error)
      return res.status(500).json({ error: "حدث خطأ أثناء فحص رقم الهاتف" })
    }
  }

  // PHONE LOOKUP FOR PARTICIPANT DATA (to check what questions they've filled)
  if (action === "phone-lookup-data") {
    const { phone_number } = req.body

    if (!phone_number) {
      return res.status(400).json({ error: "يرجى إدخال رقم الهاتف" })
    }

    try {
      // Normalize phone number - extract last 6 digits (same logic as signup)
      const normalizedPhone = phone_number.replace(/\D/g, '')
      if (normalizedPhone.length < 6) {
        return res.status(400).json({ error: "رقم الهاتف يجب أن يحتوي على 6 أرقام على الأقل" })
      }

      const lastSixDigits = normalizedPhone.slice(-6)

      // Find participant by phone number (last 6 digits)
      const { data: participants, error: searchError } = await supabase
        .from("participants")
        .select("assigned_number, name, humor_banter_style, early_openness_comfort, survey_data")
        .eq("match_id", "00000000-0000-0000-0000-000000000000")
        .ilike("phone_number", `%${lastSixDigits}`)

      if (searchError) {
        console.error("Phone lookup error:", searchError)
        return NextResponse.json({ success: false, error: 'خطأ في البحث عن المشارك' }, { status: 500 })
      }

      if (!participants || participants.length === 0) {
        return NextResponse.json({ success: false, error: 'لم يتم العثور على نتائج التوافق' }, { status: 404 })
      }

      if (participants.length > 1) {
        return NextResponse.json({ success: false, error: "تم العثور على أكثر من مشارك بهذا الرقم، يرجى التواصل مع المنظم" }, { status: 400 })
      }
      
      const participant = participants[0]

      return NextResponse.json({
        success: true,
        participant: {
          assigned_number: participant.assigned_number,
          name: participant.name,
          humor_banter_style: participant.humor_banter_style,
          early_openness_comfort: participant.early_openness_comfort,
          survey_data: participant.survey_data
        }
      })

    } catch (err) {
      console.error("Phone lookup data error:", err)
      return res.status(500).json({ error: "حدث خطأ في النظام" })
    }
  }

  // PHONE LOOKUP FOR RETURNING PARTICIPANTS
  if (action === "phone-lookup-signup") {
    const { phone_number, gender_preference, humor_banter_style, early_openness_comfort, auto_signup_next_event } = req.body

    if (!phone_number) {
      return res.status(400).json({ error: "Phone number is required" })
    }

    try {
      // Normalize phone number - extract last 7 digits for higher uniqueness
      const normalizedPhone = phone_number.replace(/\D/g, '') // Remove all non-digits
      if (normalizedPhone.length < 7) {
        return res.status(400).json({ error: "رقم الهاتف قصير جداً (نحتاج آخر 7 أرقام)" })
      }
      const lastSevenDigits = normalizedPhone.slice(-7)
      console.log('Looking up verified participant phone')

      // Query by ending digits directly (case-insensitive) and same match_id
      const match_id = process.env.CURRENT_MATCH_ID || "00000000-0000-0000-0000-000000000000"
      const { data: matchingParticipants, error: searchError } = await supabase
        .from("participants")
        .select("id, assigned_number, name, phone_number, survey_data, signup_for_next_event, match_id, event_id, nationality, prefer_same_nationality, preferred_age_min, preferred_age_max, open_age_preference")
        .eq("match_id", match_id)
        .not("phone_number", "is", null)
        .ilike("phone_number", `%${lastSevenDigits}`)
        .order("created_at", { ascending: false })

      console.log(`🎯 Found ${matchingParticipants.length} matching participants`)

      if (matchingParticipants.length === 0) {
        return res.status(404).json({ 
          error: "لم يتم العثور على مشارك بهذا الرقم",
          message: `تأكد من الرقم أو قم بالتسجيل كمشارك جديد. البحث عن: ${lastSevenDigits}`,
          debug: {
            searchedDigits: lastSevenDigits
          }
        })
      }

      if (matchingParticipants.length > 1) {
        return res.status(400).json({ 
          error: "تم العثور على أكثر من مشارك بنفس الرقم",
          message: "يرجى التواصل مع المنظم"
        })
      }

      const participant = matchingParticipants[0]
      
      // Check if already signed up for next event
      if (participant.signup_for_next_event) {
        return res.status(400).json({ 
          error: "أنت مسجل بالفعل للحدث القادم",
          message: "سيتم التواصل معك قريباً"
        })
      }

      // Prepare update data
      const updateData = {
        signup_for_next_event: true,
        next_event_signup_timestamp: new Date().toISOString(),
        auto_signup_next_event: auto_signup_next_event === true ? true : false,
        signup_event_id: participant.event_id || null
      }

      console.log(`✨ Auto signup for all future events: ${auto_signup_next_event === true ? 'YES' : 'NO'}`)

      // Handle gender preference update if provided
      if (gender_preference) {
        if (gender_preference === "same_gender") {
          updateData.same_gender_preference = true
          updateData.any_gender_preference = false
          console.log('👥 Updated gender preference: same gender only')
        } else if (gender_preference === "any_gender") {
          updateData.same_gender_preference = false
          updateData.any_gender_preference = true
          console.log('🌐 Updated gender preference: any gender')
        } else {
          // Default or empty - opposite gender
          updateData.same_gender_preference = false
          updateData.any_gender_preference = false
          console.log('👫 Updated gender preference: opposite gender (default)')
        }
        // Also update the survey_data JSONB (only if it exists to avoid overwriting)
        if (participant.survey_data && typeof participant.survey_data === 'object') {
          const newSurveyData = JSON.parse(JSON.stringify(participant.survey_data));
          if (!newSurveyData.answers || typeof newSurveyData.answers !== 'object') {
            newSurveyData.answers = {};
          }
          newSurveyData.answers.gender_preference = gender_preference;

          // Mirror the logic from SurveyComponent to keep data consistent
          const userGender = newSurveyData.answers.gender || newSurveyData.gender || null;
          if (gender_preference === 'any_gender' || gender_preference === 'any') {
            newSurveyData.answers.actual_gender_preference = 'any_gender';
          } else if (userGender && (gender_preference === userGender)) {
            newSurveyData.answers.actual_gender_preference = 'same_gender';
          } else {
            newSurveyData.answers.actual_gender_preference = 'opposite_gender';
          }

          updateData.survey_data = newSurveyData;
          console.log('📝 Updated gender_preference in survey_data JSONB (merged)');
        } else {
          console.log('ℹ️ survey_data not present; skipping JSONB update to avoid overwriting');
        }
      }

      // Handle interaction style updates if provided
      if (humor_banter_style && ['A', 'B', 'C', 'D'].includes(humor_banter_style)) {
        updateData.humor_banter_style = humor_banter_style
        console.log('😄 Updated humor/banter style:', humor_banter_style)
      }

      if (early_openness_comfort !== undefined) {
        const comfortLevel = parseInt(early_openness_comfort)
        if (!isNaN(comfortLevel) && [0, 1, 2, 3].includes(comfortLevel)) {
          updateData.early_openness_comfort = comfortLevel
          console.log('🤝 Updated early openness comfort:', comfortLevel)
        }
      }

      // Update participant to sign up for next event
      const { error: updateError } = await supabase
        .from("participants")
        .update(updateData)
        .eq("id", participant.id)

      if (updateError) {
        console.error("Update Error:", updateError)
        return res.status(500).json({ error: "Failed to register for next event" })
      }

      console.log(`Participant #${participant.assigned_number} signed up for next event`)

      return res.status(200).json({
        success: true,
        message: "تم تسجيلك للحدث القادم بنجاح!",
        participant_name: participant.name,
        participant_number: participant.assigned_number
      })

    } catch (error) {
      console.error("Error in phone-lookup-signup:", error)
      return res.status(500).json({ error: "حدث خطأ أثناء التسجيل للحدث القادم" })
    }
  }

  // CHECK NEXT EVENT SIGNUP STATUS ACTION
  if (action === "check-next-event-signup") {
    try {
      const { secure_token } = req.body
      
      if (!secure_token) {
        return res.status(400).json({ error: "Missing secure_token" })
      }

      // Get participant data by token
      const { data: participant, error: participantError } = await supabase
        .from("participants")
        .select("id, assigned_number, name, phone_number, event_id, signup_for_next_event, auto_signup_next_event, humor_banter_style, early_openness_comfort")
        .eq("secure_token", secure_token)
        .single()

      if (participantError || !participant) {
        console.error("Participant lookup error:", participantError)
        return res.status(404).json({ error: "Participant not found" })
      }

      const { data: eventState } = await supabase
        .from("event_state")
        .select("current_event_id")
        .eq("match_id", "00000000-0000-0000-0000-000000000000")
        .maybeSingle()
      const currentEventId = Number(eventState?.current_event_id || 1)

      return res.status(200).json({
        success: true,
        participant: {
          assigned_number: participant.assigned_number,
          name: participant.name,
          phone_number: participant.phone_number,
          signup_for_next_event: participant.signup_for_next_event,
          auto_signup_next_event: participant.auto_signup_next_event,
          is_signed_up: isEvent3SignedUp(participant, currentEventId),
          current_event_id: currentEventId,
          humor_banter_style: participant.humor_banter_style,
          early_openness_comfort: participant.early_openness_comfort
        }
      })

    } catch (error) {
      console.error("Error checking next event signup:", error)
      return res.status(500).json({ error: "حدث خطأ أثناء فحص حالة التسجيل" })
    }
  }

  // AUTO SIGNUP FOR NEXT EVENT ACTION (for logged in users)
  if (action === "auto-signup-next-event") {
    try {
      const { secure_token, gender_preference, humor_banter_style, early_openness_comfort, auto_signup_next_event } = req.body
      
      if (!secure_token) {
        return res.status(400).json({ error: "Missing secure_token" })
      }

      // Get participant data by token (include survey_data for safe merge)
      const { data: participant, error: participantError } = await supabase
        .from("participants")
        .select("id, assigned_number, name, phone_number, signup_for_next_event, survey_data, event_id")
        .eq("secure_token", secure_token)
        .single()

      if (participantError || !participant) {
        console.error("Participant lookup error:", participantError)
        return res.status(404).json({ error: "Participant not found" })
      }

      // Prepare update data
      const updateData = {
        signup_for_next_event: true,
        auto_signup_next_event: auto_signup_next_event === true ? true : false,
        signup_event_id: participant.event_id || null
      }

      // Only update timestamp if not already signed up
      if (!participant.signup_for_next_event) {
        updateData.next_event_signup_timestamp = new Date().toISOString()
      }

      console.log(`✨ Auto signup for all future events: ${auto_signup_next_event === true ? 'YES' : 'NO'}`)

      // Handle gender preference update if provided
      if (gender_preference) {
        if (gender_preference === "same_gender") {
          updateData.same_gender_preference = true
          updateData.any_gender_preference = false
          console.log('👥 Updated gender preference: same gender only')
        } else if (gender_preference === "any_gender") {
          updateData.same_gender_preference = false
          updateData.any_gender_preference = true
          console.log('🌐 Updated gender preference: any gender')
        } else {
          // Default or empty - opposite gender
          updateData.same_gender_preference = false
          updateData.any_gender_preference = false
          console.log('👫 Updated gender preference: opposite gender (default)')
        }

        // Also update the survey_data JSONB
        const newSurveyData = participant.survey_data ? JSON.parse(JSON.stringify(participant.survey_data)) : {};
        if (!newSurveyData.answers) {
          newSurveyData.answers = {};
        }
        newSurveyData.answers.gender_preference = gender_preference;

        // Mirror the logic from SurveyComponent to keep data consistent
        const userGender = newSurveyData.answers.gender;
        if (gender_preference === 'any_gender' || gender_preference === 'any') {
            newSurveyData.answers.actual_gender_preference = 'any_gender';
        } else if (gender_preference === userGender) {
            newSurveyData.answers.actual_gender_preference = 'same_gender';
        } else {
            newSurveyData.answers.actual_gender_preference = 'opposite_gender';
        }

        updateData.survey_data = newSurveyData;
        console.log('📝 Updated gender_preference in survey_data JSONB');
      }

      // Handle interaction style updates if provided
      if (humor_banter_style && ['A', 'B', 'C', 'D'].includes(humor_banter_style)) {
        updateData.humor_banter_style = humor_banter_style
        console.log('😄 Updated humor/banter style:', humor_banter_style)
      }

      if (early_openness_comfort !== undefined) {
        const comfortLevel = parseInt(early_openness_comfort)
        if (!isNaN(comfortLevel) && [0, 1, 2, 3].includes(comfortLevel)) {
          updateData.early_openness_comfort = comfortLevel
          console.log('🤝 Updated early openness comfort:', comfortLevel)
        }
      }

      // Update participant to sign up for next event
      const { error: updateError } = await supabase
        .from("participants")
        .update(updateData)
        .eq("id", participant.id)

      if (updateError) {
        console.error("Update Error:", updateError)
        return res.status(500).json({ error: "Failed to register for next event" })
      }

      console.log(`Auto-signup completed for participant #${participant.assigned_number}`)

      return res.status(200).json({
        success: true,
        message: "تم تسجيلك للحدث القادم بنجاح!",
        participant_name: participant.name,
        participant_number: participant.assigned_number
      })

    } catch (error) {
      console.error("Error in auto-signup-next-event:", error)
      return res.status(500).json({ error: "حدث خطأ أثناء التسجيل للحدث القادم" })
    }
  }

  // DISABLE AUTO SIGNUP FOR NEXT EVENT ACTION
  if (action === "disable-auto-signup") {
    try {
      const { secure_token } = req.body
      
      if (!secure_token) {
        return res.status(400).json({ error: "Missing secure_token" })
      }

      const match_id = process.env.CURRENT_MATCH_ID || "00000000-0000-0000-0000-000000000000"

      // Find participant by secure_token
      const { data: participant, error: findError } = await supabase
        .from("participants")
        .select("assigned_number")
        .eq("secure_token", secure_token)
        .single()

      if (findError || !participant) {
        console.error("Participant not found:", findError)
        return res.status(404).json({ error: "المشارك غير موجود" })
      }

      // Update participant to disable auto-signup only (keep next event signup)
      const { error: updateError } = await supabase
        .from("participants")
        .update({
          auto_signup_next_event: false
        })
        .eq("secure_token", secure_token)

      if (updateError) {
        console.error("Error disabling auto-signup:", updateError)
        return res.status(500).json({ error: "فشل إيقاف التسجيل التلقائي" })
      }

      console.log(`✅ Auto-signup disabled for participant #${participant.assigned_number}`)

      return res.status(200).json({
        success: true,
        message: "تم إيقاف التسجيل التلقائي بنجاح",
        participant_number: participant.assigned_number
      })

    } catch (error) {
      console.error("Error in disable-auto-signup:", error)
      return res.status(500).json({ error: "حدث خطأ أثناء إيقاف التسجيل التلقائي" })
    }
  }

  // UNREGISTER FROM NEXT EVENT ACTION
  if (action === "unregister-next-event") {
    try {
      const { secure_token } = req.body
      
      if (!secure_token) {
        return res.status(400).json({ error: "Missing secure_token" })
      }

      const match_id = process.env.CURRENT_MATCH_ID || "00000000-0000-0000-0000-000000000000"

      // Find participant by secure_token
      const { data: participant, error: findError } = await supabase
        .from("participants")
        .select("assigned_number")
        .eq("secure_token", secure_token)
        .single()

      if (findError || !participant) {
        console.error("Participant not found:", findError)
        return res.status(404).json({ error: "المشارك غير موجود" })
      }

      // Update participant to unregister from next event
      const { error: updateError } = await supabase
        .from("participants")
        .update({
          signup_for_next_event: false
        })
        .eq("secure_token", secure_token)

      if (updateError) {
        console.error("Error unregistering from next event:", updateError)
        return res.status(500).json({ error: "فشل إلغاء التسجيل في الفعالية القادمة" })
      }

      console.log(`✅ Participant #${participant.assigned_number} unregistered from next event`)

      return res.status(200).json({
        success: true,
        message: "تم إلغاء تسجيلك في الفعالية القادمة بنجاح",
        participant_number: participant.assigned_number
      })

    } catch (error) {
      console.error("Error in unregister-next-event:", error)
      return res.status(500).json({ error: "حدث خطأ أثناء إلغاء التسجيل" })
    }
  }

  // UPDATE VIBE QUESTIONS ACTION
  if (action === "update-vibe-questions") {
    try {
      const { secure_token, vibe_answers } = req.body
      const match_id = process.env.CURRENT_MATCH_ID || "00000000-0000-0000-0000-000000000000"
      
      if (!secure_token || !vibe_answers) {
        return res.status(400).json({ error: "Missing secure_token or vibe_answers" })
      }

      console.log('📝 Updating vibe questions for authenticated participant')

      // Get participant by token
      const { data: participant, error: participantError } = await supabase
        .from("participants")
        .select("assigned_number, survey_data")
        .eq("secure_token", secure_token)
        .eq("match_id", match_id)
        .single()

      if (participantError || !participant) {
        console.error('❌ Participant not found:', participantError)
        return res.status(404).json({ error: "Participant not found" })
      }

      // Determine if survey_data uses nested structure (answers.vibe_1) or top-level (vibe_1)
      const existingSurveyData = participant.survey_data || {}
      const hasNestedStructure = existingSurveyData.answers && typeof existingSurveyData.answers === 'object'
      
      let updatedSurveyData
      let answersForVibeExtraction
      
      if (hasNestedStructure) {
        // Update nested structure: survey_data.answers.vibe_1
        updatedSurveyData = {
          ...existingSurveyData,
          answers: {
            ...existingSurveyData.answers,
            ...vibe_answers
          }
        }
        answersForVibeExtraction = updatedSurveyData.answers
      } else {
        // Update top-level structure: survey_data.vibe_1
        updatedSurveyData = {
          ...existingSurveyData,
          ...vibe_answers
        }
        answersForVibeExtraction = updatedSurveyData
      }

      // Recalculate vibeDescription from updated vibe answers
      const weekend = (answersForVibeExtraction['vibe_1'] || '') 
      const hobbies = (answersForVibeExtraction['vibe_2'] || '')
      const music = (answersForVibeExtraction['vibe_3'] || '')
      const deepTalk = (answersForVibeExtraction['vibe_4'] || '')
      const friendsDescribe = (answersForVibeExtraction['vibe_5'] || '')
      const describeFriends = (answersForVibeExtraction['vibe_6'] || '')
      
      // Create structured vibe description combining all answers
      const vibeDescription = [
        weekend ? `Weekend: ${weekend}` : '',
        hobbies ? `Hobbies: ${hobbies}` : '',
        music ? `Music: ${music}` : '',
        deepTalk ? `Deep conversations: ${deepTalk}` : '',
        friendsDescribe ? `Friends describe me as: ${friendsDescribe}` : '',
        describeFriends ? `I describe my friends as: ${describeFriends}` : ''
      ].filter(Boolean).join(' | ')
      
      // Update vibeDescription in survey_data
      updatedSurveyData.vibeDescription = vibeDescription
      
      console.log('📝 Updating structure:', hasNestedStructure ? 'nested (answers.vibe_1)' : 'top-level (vibe_1)')
      console.log('✨ Recalculated vibeDescription:', vibeDescription.substring(0, 100) + '...')

      // Update participant in database
      const { error: updateError } = await supabase
        .from("participants")
        .update({ survey_data: updatedSurveyData })
        .eq("secure_token", secure_token)
        .eq("match_id", match_id)

      if (updateError) {
        console.error('❌ Error updating vibe questions:', updateError)
        return res.status(500).json({ error: "Failed to update vibe questions" })
      }

      console.log('✅ Vibe questions updated successfully for participant:', participant.assigned_number)
      return res.status(200).json({ 
        success: true,
        message: "تم تحديث إجاباتك بنجاح"
      })

    } catch (err) {
      console.error('❌ Error in update-vibe-questions:', err)
      return res.status(500).json({ error: err.message })
    }
  }
// ---------------------------------------------------------------------------
  // ACTION: GENERATE AI VIBE ANALYSIS
  // ---------------------------------------------------------------------------
  if (action === "generate-vibe-analysis") {
    try {
      const { secure_token, partner_number, event_id } = req.body
      const match_id = process.env.CURRENT_MATCH_ID || "00000000-0000-0000-0000-000000000000"
      
      // 1. Validation
      if (!secure_token || !partner_number || !event_id) {
        return res.status(400).json({ error: "Missing secure_token, partner_number, or event_id" })
      }

      // --- HELPER FUNCTIONS ---

      // Safely extract answers from nested or flat structure
      const getAns = (p, key) => {
        return p.survey_data?.answers?.[key] || p.survey_data?.[key] || ""
      }

      // Map English names to Arabic to keep the narrative consistent
      const cleanName = (fullName) => {
        if (!fullName) return "المشارك"
        const first = fullName.trim().split(/\s+/)[0]
        // Common mappings
        const map = { 
          "Ahmed": "أحمد", "Sara": "سارة", "Mohammad": "محمد", "Ali": "علي", 
          "Fatima": "فاطمة", "Omar": "عمر", "Nora": "نورا", "Khalid": "خالد", 
          "Lama": "لمى", "Fahad": "فهد", "Saud": "سعود", "Reem": "ريم" 
        }
        return map[first] || first
      }

      // Convert Abstract Codes (A/B/C) to Semantic Meaning for AI
      const interpretProfile = (p) => {
        // Q35: Conversational Role
        const roleMap = { 'أ': 'مبادر ويقود السوالف', 'ب': 'متفاعل وحيوي', 'ج': 'مستمع هادئ' }
        // Q37: Social Battery
        const energyMap = { 'أ': 'طاقة عالية وتزيد مع الناس', 'ب': 'طاقة هادئة وتحتاج روقان' }
        // Q40: Intent
        const intentMap = { 'أ': 'تكوين صداقات', 'ب': 'بحث عن كيمياء عميقة (Spark)', 'ج': 'تجربة اجتماعية' }

        return {
          vibes: `${getAns(p, 'vibe_1')} | ${getAns(p, 'vibe_2')} | ${getAns(p, 'vibe_3')}`,
          personality: getAns(p, 'vibe_5'), // How friends describe them
          social_style: `${roleMap[getAns(p, 'q35')] || 'متوازن'} / ${energyMap[getAns(p, 'q37')] || 'طاقة متوسطة'}`,
          goal: intentMap[getAns(p, 'q40')] || 'تعارف عام',
          hooks: getAns(p, 'vibe_2') // Specific hobbies to target
        }
      }

      // ------------------------

      // 2. Get Participant 1 (Current User)
      const { data: participant, error: participantError } = await supabase
        .from("participants")
        .select("assigned_number, survey_data")
        .eq("secure_token", secure_token)
        .eq("match_id", match_id)
        .single()

      if (participantError || !participant) {
        console.error("Participant lookup error:", participantError)
        return res.status(404).json({ error: "Participant not found" })
      }

      // 3. Check Cache (Avoid paying for OpenAI if analysis exists)
      // Logic: Check match_results for this pair
      const { data: existingMatch, error: matchLookupError } = await supabase
        .from("match_results")
        .select("ai_personality_analysis")
        .eq("match_id", match_id)
        .eq("event_id", event_id)
        .or(`and(participant_a_number.eq.${participant.assigned_number},participant_b_number.eq.${partner_number}),and(participant_a_number.eq.${partner_number},participant_b_number.eq.${participant.assigned_number})`)
        .single()

      if (existingMatch?.ai_personality_analysis) {
        console.log(`🔄 Returning Cached Analysis for ${participant.assigned_number} <-> ${partner_number}`)
        return res.status(200).json({
          success: true,
          analysis: existingMatch.ai_personality_analysis,
          cached: true
        })
      }

      // 4. Get Participant 2 (Partner)
      const { data: partner, error: partnerError } = await supabase
        .from("participants")
        .select("assigned_number, survey_data")
        .eq("assigned_number", partner_number)
        .eq("match_id", match_id)
        .single()

      if (partnerError || !partner) {
        console.error("Partner lookup error:", partnerError)
        return res.status(404).json({ error: "Partner not found" })
      }

      // 5. Build The Context Objects
      const name1 = cleanName(participant.survey_data?.name)
      const name2 = cleanName(partner.survey_data?.name)

      const p1Data = interpretProfile(participant)
      const p2Data = interpretProfile(partner)

      // 6. The "Spark" Narrative Prompt
      const prompt = `أنت "محلل ذكاء اجتماعي" متطور جداً، تفهم النفسيات وتعرف خبايا الرياض (Riyadh Local Expert).
مهمتك: قراءة ملفين لشخصين وتحليل "الكيمياء الخفية" بينهما بأسلوب ذكي، واقعي، وغير مبتذل.

[الملف الأول: ${name1}]
- "الجو العام": ${p1Data.vibes}
- "الشخصية": ${p1Data.personality}
- "الدور الاجتماعي": ${p1Data.social_style}
- "الهدف": ${p1Data.goal}

[الملف الثاني: ${name2}]
- "الجو العام": ${p2Data.vibes}
- "الشخصية": ${p2Data.personality}
- "الدور الاجتماعي": ${p2Data.social_style}
- "الهدف": ${p2Data.goal}

المطلوب:
اكتب تحليلاً واحداً مركزاً (160-180 كلمة) بلهجة "سعودية بيضاء" راقية جداً.

1. ابدأ بـ "المعادلة النفسية": (مثلاً: "اجتماع هدوء ${name1} مع اندفاع ${name2} يخلق توازن مطلوب...")
2. حلل "الديناميكية": لا تسرد الهوايات، بل اشرح *كيف* يتفاعلون. (مثلاً: "بما أن فهد يحب التفاصيل وسارة تحب الاستماع، الحوار بينهم ما راح يوقف").
3. استخدم مفرداتهم بذكاء: (إذا ذكروا "كشتة"، "بادل"، "قيمنق" -> وظفها في سياق التحليل).
4. اقترح "Setting" واقعي في الرياض: (مثلاً: "يناسبهم مكان رايق في حي السفارات"، "يحتاجون ضجة البوليفارد"، "جلسة شتوية في العمارية").

🚫 قائمة الممنوعات (Strict Constraints):
- ممنوع ذكر "أنهار"، "غابات"، "زقزقة عصافير" (نحن في الرياض!).
- ممنوع العبارات المستهلكة مثل: "مزيج رائع"، "كوب شاي دافئ"، "نتمنى لكم".
- ممنوع التكرار. كن مباشراً وحاد الذكاء.

الهدف: أن يقرأ المستخدم التحليل ويقول: "واو! الذكاء الاصطناعي فاهمني فعلاً".`

      // 7. Generate with Anti-Repetition Settings
      console.log('Generating fresh compatibility analysis')
      
      const completion = await openai.chat.completions.create({
        model: "gpt-5.4-mini",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 500,
        temperature: 0.82,     // High creativity but controlled
        presence_penalty: 0.8,  // Forces new vocabulary
        frequency_penalty: 0.3
            })

      const analysis = completion.choices[0]?.message?.content?.trim()
      
      if (!analysis) {
        throw new Error("AI generated empty analysis")
      }

      // 8. Store Result
      const { error: updateError } = await supabase
        .from("match_results")
        .update({ ai_personality_analysis: analysis })
        .eq("match_id", match_id)
        .eq("event_id", event_id)
        .or(`and(participant_a_number.eq.${participant.assigned_number},participant_b_number.eq.${partner_number}),and(participant_a_number.eq.${partner_number},participant_b_number.eq.${participant.assigned_number})`)

      if (updateError) {
        console.error("Error storing analysis:", updateError)
        return res.status(500).json({ error: "Failed to store analysis" })
      }

      return res.status(200).json({
        success: true,
        analysis: analysis,
        cached: false
      })
      
    } catch (error) {
      console.error("Error in generate-vibe-analysis:", error)
      return res.status(500).json({ 
        error: "Failed to generate vibe analysis",
        details: error.message 
      })
    }
  }  // ENABLE AUTO-SIGNUP FOR ALL FUTURE EVENTS
  if (action === "enable-auto-signup") {
    try {
      const { secure_token } = req.body
      
      if (!secure_token) {
        return res.status(400).json({ error: "Missing secure_token" })
      }

      // Get participant data by token
      const { data: participant, error: participantError } = await supabase
        .from("participants")
        .select("id, assigned_number, name, auto_signup_next_event")
        .eq("secure_token", secure_token)
        .single()

      if (participantError || !participant) {
        console.error("Participant lookup error:", participantError)
        return res.status(404).json({ error: "Participant not found" })
      }

      // Check if already enabled
      if (participant.auto_signup_next_event) {
        return res.status(200).json({ 
          success: true,
          message: "التسجيل التلقائي مفعّل بالفعل",
          already_enabled: true
        })
      }

      // Enable auto-signup
      const { error: updateError } = await supabase
        .from("participants")
        .update({ auto_signup_next_event: true })
        .eq("id", participant.id)

      if (updateError) {
        console.error("Update Error:", updateError)
        return res.status(500).json({ error: "Failed to enable auto-signup" })
      }

      console.log(`Auto-signup enabled for participant #${participant.assigned_number}`)

      return res.status(200).json({
        success: true,
        message: "تم تفعيل التسجيل التلقائي لجميع الأحداث القادمة!",
        participant_name: participant.name,
        participant_number: participant.assigned_number
      })

    } catch (error) {
      console.error("Error in enable-auto-signup:", error)
      return res.status(500).json({ error: "حدث خطأ أثناء تفعيل التسجيل التلقائي" })
    }
  }

  // 🔹 PREDICT MATCH SUCCESS
  if (action === "predict-match-success") {
    try {
      const { participant1, participant2 } = req.body

      if (!participant1 || !participant2) {
        return res.status(400).json({ error: "Both participant numbers are required" })
      }

      if (participant1 === participant2) {
        return res.status(400).json({ error: "Cannot predict match success for same participant" })
      }

      // Fetch both participants
      const { data: participants, error: fetchError } = await supabase
        .from("participants")
        .select("assigned_number, name, survey_data, mbti_personality_type, attachment_style, communication_style, age, gender")
        .eq("match_id", match_id)
        .in("assigned_number", [participant1, participant2])

      if (fetchError) {
        console.error("Error fetching participants:", fetchError)
        return res.status(500).json({ error: "Failed to fetch participant data" })
      }

      if (!participants || participants.length !== 2) {
        return res.status(404).json({ error: "One or both participants not found" })
      }

      const p1 = participants.find(p => p.assigned_number === participant1)
      const p2 = participants.find(p => p.assigned_number === participant2)

      if (!p1 || !p2) {
        return res.status(404).json({ error: "Participant data incomplete" })
      }

      // Check if participants have survey data
      if (!p1.survey_data || !p2.survey_data) {
        return res.status(400).json({ error: "Both participants must have completed survey data" })
      }

      // Fetch previous feedback patterns for similar matches
      const { data: feedbackMatches, error: feedbackError } = await supabase
        .from("match_results")
        .select(`
          compatibility_score,
          mbti_compatibility_score,
          attachment_compatibility_score,
          communication_compatibility_score,
          lifestyle_compatibility_score,
          core_values_compatibility_score,
          vibe_compatibility_score,
          feedback(compatibility_rate, conversation_quality, personal_connection, would_meet_again)
        `)
        .eq("match_id", match_id)
        .eq("event_id", event_id)
        .gte("round", 4)
        .not("feedback", "is", null)

      // Create AI prompt for prediction
      const prompt = `You are an expert relationship compatibility analyst. Analyze the following two participants and predict their match success probability based on their survey responses and historical feedback patterns.

PARTICIPANT 1 (#${participant1}):
- Name: ${p1.name || 'Not provided'}
- Age: ${p1.age || p1.survey_data?.age || 'Not provided'}
- Gender: ${p1.gender || p1.survey_data?.gender || 'Not provided'}
- MBTI: ${p1.mbti_personality_type || p1.survey_data?.mbti || 'Not provided'}
- Attachment Style: ${p1.attachment_style || 'Not provided'}
- Communication Style: ${p1.communication_style || 'Not provided'}
- Survey Answers: ${JSON.stringify(p1.survey_data?.answers || {}, null, 2)}

PARTICIPANT 2 (#${participant2}):
- Name: ${p2.name || 'Not provided'}
- Age: ${p2.age || p2.survey_data?.age || 'Not provided'}
- Gender: ${p2.gender || p2.survey_data?.gender || 'Not provided'}
- MBTI: ${p2.mbti_personality_type || p2.survey_data?.mbti || 'Not provided'}
- Attachment Style: ${p2.attachment_style || 'Not provided'}
- Communication Style: ${p2.communication_style || 'Not provided'}
- Survey Answers: ${JSON.stringify(p2.survey_data?.answers || {}, null, 2)}

HISTORICAL FEEDBACK PATTERNS:
${feedbackMatches ? `Based on ${feedbackMatches.length} previous matches with feedback data.` : 'No historical feedback data available.'}

TASK:
1. Calculate a success probability percentage (0-100%)
2. Provide a detailed analysis explaining the prediction
3. Focus on compatibility factors, potential challenges, and strengths
4. Consider personality compatibility, lifestyle alignment, and communication styles
5. Reference specific survey answers that support your prediction

Please respond in JSON format:
{
  "success_probability": [number between 0-100],
  "analysis": "[detailed analysis in Arabic, 200-300 words]",
  "compatibility_scores": {
    "personality": [0-100],
    "lifestyle": [0-100], 
    "communication": [0-100],
    "values": [0-100],
    "interests": [0-100]
  },
  "key_factors": {
    "strengths": ["factor1", "factor2", "factor3"],
    "challenges": ["challenge1", "challenge2"],
    "recommendations": ["rec1", "rec2"]
  }
}`

      // Generate prediction using OpenAI
      const completion = await openai.chat.completions.create({
        model: "gpt-5.4-mini",
        messages: [
          {
            role: "system",
            content: "You are an expert relationship compatibility analyst. Provide accurate, culturally sensitive predictions based on survey data and psychological compatibility factors. Always respond in valid JSON format."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        max_completion_tokens: 1500
      })

      const predictionText = completion.choices[0]?.message?.content
      if (!predictionText) {
        return res.status(500).json({ error: "Failed to generate prediction" })
      }

      try {
        const prediction = JSON.parse(predictionText)
        
        console.log(`✅ Match success prediction generated for participants ${participant1} ↔ ${participant2}: ${prediction.success_probability}%`)
        
        return res.status(200).json({
          success: true,
          ...prediction,
          participants: {
            participant1: { number: participant1, name: p1.name },
            participant2: { number: participant2, name: p2.name }
          }
        })
      } catch (parseError) {
        console.error("Error parsing AI response:", parseError)
        return res.status(500).json({ 
          error: "Failed to parse prediction response",
          raw_response: predictionText 
        })
      }

    } catch (error) {
      console.error("Error in predict-match-success:", error)
      return res.status(500).json({ 
        error: "Failed to predict match success",
        details: error.message 
      })
    }
  }

  // ── Event 5.0 participant actions ─────────────────────────────────────────────
  if (action && action.startsWith("e3-")) {
    const E3_MATCH_ID = "00000000-0000-0000-0000-000000000003"
    const MAIN_MATCH = "00000000-0000-0000-0000-000000000000"
    const firstName = (n) => n ? n.trim().split(/\s+/)[0] : "—"

    // Resolve token to participant (cached to reduce DB load on polling actions).
    // A successful "no row" response is a confirmed invalid token and may be
    // cached. Supabase/PostgREST failures are never cached as missing users.
    const resolveE3Token = async (tok) => {
      if (!tok) return { status: "missing", participant: null, error: null }
      const cached = _e3TokenCache.get(tok)
      if (cached && cached.expiresAt > Date.now()) {
        return {
          status: cached.participant ? "valid" : "invalid",
          participant: cached.participant,
          error: null,
        }
      }

      try {
        const { data, error } = await supabase
          .from("participants")
          .select("assigned_number,name,gender,age,survey_data,event_id,signup_for_next_event,auto_signup_next_event")
          .eq("secure_token", tok)
          .eq("match_id", MAIN_MATCH)
          .maybeSingle()

        if (error) {
          logError("Event3 participant token lookup", error)
          return { status: "unavailable", participant: null, error }
        }

        const participant = data || null
        _e3TokenCache.set(tok, { participant, expiresAt: Date.now() + E3_TOKEN_CACHE_TTL_MS })
        return {
          status: participant ? "valid" : "invalid",
          participant,
          error: null,
        }
      } catch (error) {
        logError("Event3 participant token lookup", error)
        return { status: "unavailable", participant: null, error }
      }
    }

    const token = typeof req.body.token === "string" ? req.body.token.trim() || null : null
    const tokenResolution = await resolveE3Token(token)
    if (tokenResolution.status === "unavailable") {
      return res.status(503).json({
        error: "تعذّر التحقق من جلسة الفعالية مؤقتاً. سنحاول مرة أخرى تلقائياً.",
        code: "EVENT3_AUTH_UNAVAILABLE",
        retryable: true,
      })
    }
    const participant = tokenResolution.participant
    const myNumber = participant?.assigned_number
    if (!enforceRateLimit(req, res, participant
      ? { key: "event3-participant", identity: String(myNumber), limit: 120, windowMs: 60_000 }
      : { key: "event3-public", limit: 120, windowMs: 60_000 })) return
    if (action === "e3-heartbeat" && !participant) {
      return res.status(401).json({
        error: "جلسة المشارك غير صالحة. سجّل الدخول مرة أخرى.",
        code: "PARTICIPANT_TOKEN_INVALID",
        retryable: false,
      })
    }

    let mainEventState = null
    let e3EventState = null
    try {
      const [mainStateResult, e3StateResult] = await Promise.all([
        supabase.from("event_state").select("current_event_id").eq("match_id", MAIN_MATCH).maybeSingle(),
        supabase.from("event_state").select("current_event_id,phase,test_mode_active,test_mode_snapshot,event3_participant_access_locked").eq("match_id", E3_MATCH_ID).maybeSingle(),
      ])
      if (mainStateResult.error || e3StateResult.error) {
        if (mainStateResult.error) logError("Event3 main event-state lookup", mainStateResult.error)
        if (e3StateResult.error) logError("Event3 state lookup", e3StateResult.error)
        return res.status(503).json({
          error: "تعذّر تحميل حالة الفعالية مؤقتاً. سنحاول مرة أخرى تلقائياً.",
          code: "EVENT3_STATE_UNAVAILABLE",
          retryable: true,
        })
      }
      mainEventState = mainStateResult.data
      e3EventState = e3StateResult.data
    } catch (error) {
      logError("Event3 state lookup", error)
      return res.status(503).json({
        error: "تعذّر تحميل حالة الفعالية مؤقتاً. سنحاول مرة أخرى تلقائياً.",
        code: "EVENT3_STATE_UNAVAILABLE",
        retryable: true,
      })
    }
    const currentEventId = mainEventState?.current_event_id || e3EventState?.current_event_id || 20
    let eventFormat
    try {
      eventFormat = await loadEvent3Format(supabase, E3_MATCH_ID, currentEventId)
    } catch (error) {
      logError("Event3 format lookup", error)
      return res.status(503).json({
        error: "تعذّر تحميل إعدادات الفعالية مؤقتاً. سنحاول مرة أخرى تلقائياً.",
        code: "EVENT3_STATE_UNAVAILABLE",
        retryable: true,
      })
    }
    const groupRoundCount = event3GroupRoundCount(eventFormat)

    const participantAccessLocked = !canAccessEvent3DuringTest({
      testModeActive: e3EventState?.test_mode_active === true,
      participantAccessLocked: e3EventState?.event3_participant_access_locked === true,
      impersonate: req.body?.impersonate,
      adminOverride: req.body?.admin_override,
    })

    // The tokenless walkthrough needs the public format plus the admission
    // status so it can show the tutorial before disclosing that entry is closed.
    if (action === "e3-get-public-format") {
      return res.status(200).json({
        event_format: eventFormat,
        group_round_count: groupRoundCount,
        participant_access_locked: participantAccessLocked,
      })
    }

    // Test mode uses real participant records, so prevent ordinary participant
    // links from entering its temporary phases. Admin test links explicitly add
    // ?impersonate=1, which the Event3 client forwards with every request.
    if (participantAccessLocked) {
      return res.status(423).json({
        error: "الفعالية غير مفتوحة للمشاركين بعد. سيفتح الدخول عند انتهاء الاختبار.",
        code: "EVENT3_TEST_MODE_LOCKED",
        test_mode: e3EventState?.test_mode_active === true,
        participant_access_locked: true,
      })
    }
    const requestTestMode = isEvent3TestImpersonation(req.body?.impersonate)
    const activeTestMode = e3EventState?.test_mode_active === true
    const currentEvent3SessionKey = activeTestMode
      ? (e3EventState?.test_mode_snapshot?.started_at || "legacy-test")
      : `live:${currentEventId}`
    const expectedEvent3SessionKey = req.body?.expected_event3_session_key
    const expectedEvent3EventId = req.body?.expected_event_id
    if ((requestTestMode && !activeTestMode)
      || (expectedEvent3EventId != null && Number(expectedEvent3EventId) !== Number(currentEventId))
      || (expectedEvent3SessionKey != null && String(expectedEvent3SessionKey) !== String(currentEvent3SessionKey))) {
      return res.status(409).json({
        error: "تغيّرت جلسة الفعالية. حدّث الصفحة قبل المتابعة.",
        code: "EVENT3_SESSION_CHANGED",
        retryable: true,
      })
    }
    const activeEvent3Phase = String(e3EventState?.phase || "setup")
    const reachedGroupRounds = event3ReachedGroupRounds(activeEvent3Phase, groupRoundCount)
    const saveEvent3MatchInteraction = async ({ slot, partner, operation, payload }) => {
      const rpcResult = await supabase.rpc("save_event3_match_interaction_v2", {
        p_match_id: E3_MATCH_ID,
        p_event_id: currentEventId,
        p_participant_number: myNumber,
        p_slot: slot,
        p_expected_partner: partner,
        p_expected_test_mode: requestTestMode,
        p_expected_started_at: requestTestMode ? (expectedEvent3SessionKey || null) : null,
        p_operation: operation,
        p_payload: payload,
      })
      const rpcMessage = String(rpcResult.error?.message || "")
      const migrationMissing = rpcResult.error?.code === "PGRST202"
        || rpcResult.error?.code === "42883"
        || rpcMessage.includes("save_event3_match_interaction_v2")
      if (migrationMissing && !isChoiceOnlyEvent3(eventFormat)) {
        // Keep classic editions available during a rolling API/database deploy.
        return { fallback: true, data: null, response: null }
      }
      if (!rpcResult.error) return { fallback: false, data: rpcResult.data || {}, response: null }

      const invalid = rpcResult.error.code === "22023"
      const conflict = rpcResult.error.code === "55000"
      const migrationRequired = migrationMissing && isChoiceOnlyEvent3(eventFormat)
      const code = rpcMessage.includes("partner changed")
        ? "EVENT3_PARTNER_CHANGED"
        : rpcMessage.includes("current phase")
          ? "EVENT3_INTERACTION_CLOSED"
          : conflict
            ? "EVENT3_SESSION_CHANGED"
            : undefined
      return {
        fallback: false,
        data: null,
        response: res.status(migrationRequired ? 501 : invalid ? 400 : conflict ? 409 : 500).json({
          error: rpcResult.error.message,
          code,
          retryable: conflict,
          migration_required: migrationRequired,
        }),
      }
    }

    try {
      // e3-get-state (no auth required) / e3-heartbeat (combines state + sos + mood + notification)
      if (action === "e3-get-state" || action === "e3-heartbeat") {
        const { data: stateRow, error: stateError } = await supabase.from("event_state").select("phase,global_timer_active,global_timer_start_time,global_timer_duration,global_timer_round,phase2_score_revealed,phase3_score_revealed,current_event_id").eq("match_id", E3_MATCH_ID).single()
        if (stateError) {
          logError("Event3 heartbeat state lookup", stateError)
          return res.status(503).json({
            error: "تعذّر تحديث حالة الفعالية مؤقتاً. نعرض آخر حالة محفوظة وسنحاول تلقائياً.",
            code: "EVENT3_STATE_UNAVAILABLE",
            retryable: true,
          })
        }
        const phase = stateRow?.phase || "setup"
        const activeEventId = currentEventId || stateRow?.current_event_id || 20
        const { count: participantsSelected, error: participantCountError } = await supabase.from("event3_participants").select("id", { count: "exact", head: true }).eq("match_id", E3_MATCH_ID).eq("event_id", activeEventId)
        if (participantCountError) {
          logError("Event3 heartbeat participant count", participantCountError)
          return res.status(503).json({
            error: "تعذّر تحديث حالة الفعالية مؤقتاً. نعرض آخر حالة محفوظة وسنحاول تلقائياً.",
            code: "EVENT3_STATE_UNAVAILABLE",
            retryable: true,
          })
        }

        // Server-side auto-save: if ranking phase and timer expired, auto-save for this participant
        if (participant && /^ranking[123]$/.test(phase) && stateRow?.global_timer_active && stateRow?.global_timer_start_time) {
          const elapsed = Math.floor((Date.now() - new Date(stateRow.global_timer_start_time).getTime()) / 1000)
          const remaining = Math.max(0, (stateRow.global_timer_duration ?? getEvent3PhaseTimerSeconds(phase)) - elapsed)
          if (remaining === 0) {
            const { error: completionError } = await supabase.rpc("complete_event3_rankings_v2", {
              p_match_id: E3_MATCH_ID, p_event_id: activeEventId,
              p_completed_rounds: Number(phase.slice(-1)),
              p_expected_test_mode: requestTestMode,
              p_expected_started_at: requestTestMode ? (expectedEvent3SessionKey || null) : null,
            })
            if (completionError) logError("Event3 ranking timer completion", completionError)
          }
        }

        let myAssignment = null
        if (participant) {
          const [{ data: ep, error: rosterError }, { data: currentSignup, error: signupError }] = await Promise.all([
            supabase.from("event3_participants").select("position").eq("match_id", E3_MATCH_ID).eq("event_id", activeEventId).eq("participant_number", myNumber).maybeSingle(),
            supabase.from("participants").select("event_id,signup_for_next_event,auto_signup_next_event").eq("match_id", MAIN_MATCH).eq("assigned_number", myNumber).maybeSingle(),
          ])
          if (rosterError || signupError) {
            if (rosterError) logError("Event3 heartbeat roster lookup", rosterError)
            if (signupError) logError("Event3 heartbeat signup lookup", signupError)
            return res.status(503).json({
              error: "تعذّر تأكيد التسجيل مؤقتاً. ستبقى في شاشتك الحالية وسنحاول تلقائياً.",
              code: "EVENT3_ENROLLMENT_UNAVAILABLE",
              retryable: true,
            })
          }
          const signedUp = isEvent3SignedUp(currentSignup || participant, activeEventId)
          // event3_participants is the authoritative live roster. Test mode and
          // mid-event replacements intentionally add people here without changing
          // their normal event signup fields, so roster membership must grant access.
          const enrolledInActiveRoster = Boolean(ep)
          // Auto-mark attendance when enrolled participant polls state during a live event (not setup).
          // This prevents marking attendance for people viewing the tutorial at home before the event.
          if (ep && phase !== "setup") {
            try {
              const { data: attendanceResult, error: attendanceError } = await supabase.rpc("set_event3_attendance_v2", {
                p_event_id: Number(activeEventId),
                p_participant_number: myNumber,
                p_attended: true,
                p_updated_by: "auto-join",
                p_auto_join: true,
                p_expected_test_mode: requestTestMode,
                p_expected_started_at: requestTestMode ? String(currentEvent3SessionKey) : null,
              })
              if (attendanceError) {
                logError("Event3 auto-attendance", attendanceError)
              } else if (attendanceResult?.changed) {
                console.log(`[auto-attendance] Marked #${myNumber} as attended (phase: ${phase})`)
              }
            } catch (attErr) {
              console.error("[auto-attendance] Failed on state poll:", attErr.message)
            }
          }
          const roundMatch = phase.match(/^round(\d)$/)
          const currentRound = roundMatch
            ? parseInt(roundMatch[1])
            : phase === "phase2_reveal" ? 20
            : phase === "phase3_reveal" ? 30
            : phase === "phase4_reveal" ? 40
            : null
          if (ep && currentRound) {
            const { data: sa, error: assignmentError } = await supabase.from("session_assignments").select("table_number").eq("match_id", E3_MATCH_ID).eq("event_id", activeEventId).eq("round", currentRound).eq("participant_id", myNumber).maybeSingle()
            if (assignmentError) {
              logError("Event3 heartbeat assignment lookup", assignmentError)
              return res.status(503).json({
                error: "تعذّر تحديث رقم الطاولة مؤقتاً. ستبقى في شاشتك الحالية وسنحاول تلقائياً.",
                code: "EVENT3_ASSIGNMENT_UNAVAILABLE",
                retryable: true,
              })
            }
            myAssignment = sa ? { round: currentRound, table: sa.table_number, enrolled: true } : { enrolled: enrolledInActiveRoster || signedUp }
          } else {
            myAssignment = { enrolled: enrolledInActiveRoster || signedUp }
          }
        }
        let myInfo = null
        if (participant) {
          const sd = typeof participant.survey_data === "string" ? JSON.parse(participant.survey_data || "{}") : (participant.survey_data || {})
          const fullName = participant.name || sd?.answers?.name || sd?.name || ""
          const firstName = fullName.split(" ")[0] || fullName
          myInfo = { number: myNumber, name: firstName, gender: participant.gender || sd?.answers?.gender || sd?.gender || null }
        }
        const fallbackTimerDuration = getEvent3PhaseTimerSeconds(phase)
        const baseResponse = { phase, event_id: activeEventId, event_format: eventFormat, group_round_count: groupRoundCount, event3_session_key: currentEvent3SessionKey, timer_active: stateRow?.global_timer_active || false, timer_start: stateRow?.global_timer_start_time || null, timer_duration: stateRow?.global_timer_duration ?? fallbackTimerDuration, timer_round: stateRow?.global_timer_round || null, my_assignment: myAssignment, enrolled: myAssignment?.enrolled || false, my_info: myInfo, participants_selected: participantsSelected || 0, phase2_score_revealed: stateRow?.phase2_score_revealed || false, phase3_score_revealed: stateRow?.phase3_score_revealed || false, server_time: new Date().toISOString() }

        // Heartbeat: also fetch SOS, mood check, and notification data in one round-trip
        if (action === "e3-heartbeat" && participant) {
          const [sosRes, moodRes, notifRes] = await Promise.all([
            supabase.from("organizer_requests").select("id,status,message,organizer_reply,created_at,chat_history,request_type,table_info").eq("participant_token", token).eq("event_id", activeEventId).order("created_at", { ascending: true }),
            supabase.from("event3_mood_checks").select("check_id,triggered_at").eq("match_id", E3_MATCH_ID).eq("event_id", activeEventId).eq("participant_number", myNumber).is("mood", null).order("triggered_at", { ascending: false }).limit(1).maybeSingle(),
            supabase.from("event3_notifications").select("notif_id,title,body,icon,created_at").eq("match_id", E3_MATCH_ID).eq("event_id", activeEventId).eq("participant_number", myNumber).is("seen_at", null).order("icon", { ascending: true }).order("created_at", { ascending: true }).limit(1).maybeSingle()
          ])
          const auxiliaryError = sosRes.error || moodRes.error || notifRes.error
          if (auxiliaryError) {
            logError("Event3 heartbeat auxiliary lookup", auxiliaryError)
            return res.status(503).json({
              error: "تعذّر تحديث الرسائل والتنبيهات مؤقتاً. سنحتفظ بآخر حالة وسنحاول تلقائياً.",
              code: "EVENT3_AUXILIARY_UNAVAILABLE",
              retryable: true,
            })
          }
          baseResponse.sos_requests = sosRes.data || []
          baseResponse.mood_check = moodRes.data ? { pending: true, check_id: moodRes.data.check_id, triggered_at: moodRes.data.triggered_at } : { pending: false }
          baseResponse.notification = notifRes.data ? { pending: true, notif_id: notifRes.data.notif_id, title: notifRes.data.title, body: notifRes.data.body, icon: notifRes.data.icon, created_at: notifRes.data.created_at } : { pending: false }
        }

        return res.status(200).json(baseResponse)
      }

      // Cached clients must not retain the former phone-only login behavior.
      if (action === "e3-login-by-phone") {
        return res.status(409).json({
          error: "تم تحديث تسجيل الدخول ليطلب رمز تحقق. أعد تحميل الصفحة للمتابعة بأمان.",
          code: "EVENT3_OTP_REQUIRED",
          retryable: false,
        })
      }

      // Event 3 phone login grants the participant's regular website session,
      // but only after Authentica verifies an SMS OTP for the stored number.
      if (action === "e3-request-login-otp" || action === "e3-verify-login-otp") {
        const { phone } = req.body
        if (!phone) return res.status(400).json({ error: "رقم الجوال مطلوب" })
        if (!isPlausibleParticipantPhone(phone)) return res.status(400).json({ error: "رقم الجوال غير صحيح" })

        const { participants: exactMatches, error: phoneLookupError } = await findParticipantsByExactPhone(
          phone,
          "id,assigned_number,secure_token,name,phone_number",
        )
        if (phoneLookupError) {
          logError("Event3 OTP participant lookup", phoneLookupError)
          return res.status(503).json({ error: "تعذر التحقق من تسجيلك مؤقتاً. حاول مرة أخرى.", retryable: true })
        }
        if (exactMatches.length === 0) return res.status(404).json({ error: "لم يتم العثور على رقمك في الفعالية. تأكد من الرقم أو تواصل مع المنظم." })

        // Duplicate historical accounts are resolved against the active Event3
        // roster; only the single enrolled account may receive a full login.
        const candidateNumbers = exactMatches.map(candidate => candidate.assigned_number)
        const { data: enrolledRows, error: enrolledError } = await supabase.from("event3_participants")
          .select("participant_number")
          .eq("match_id", E3_MATCH_ID)
          .eq("event_id", currentEventId)
          .in("participant_number", candidateNumbers)
        if (enrolledError) {
          logError("Event3 OTP enrollment lookup", enrolledError)
          return res.status(503).json({ error: "تعذر التحقق من تسجيلك مؤقتاً. حاول مرة أخرى.", retryable: true })
        }
        const enrolledNumbers = new Set((enrolledRows || []).map(row => row.participant_number))
        const enrolledMatches = exactMatches.filter(candidate => enrolledNumbers.has(candidate.assigned_number))
        if (enrolledMatches.length > 1) return res.status(409).json({ error: "يوجد أكثر من حساب بنفس رقم الجوال مسجّل في هذه الفعالية. تواصل مع المنظم للدخول بأمان." })
        if (enrolledMatches.length === 0) return res.status(403).json({ error: "رقمك غير مسجّل في هذه الفعالية. تواصل مع المنظم." })

        const matchedParticipant = enrolledMatches[0]
        const verifiedPhone = participantPhoneToE164(matchedParticipant.phone_number)
        const otpRateLimit = action === "e3-request-login-otp"
          ? { key: "e3-login-otp-request", identity: String(matchedParticipant.assigned_number), limit: 3, windowMs: 10 * 60_000 }
          : { key: "e3-login-otp-verify", identity: String(matchedParticipant.assigned_number), limit: 10, windowMs: 15 * 60_000 }
        if (!enforceRateLimit(req, res, otpRateLimit)) return
        res.setHeader("Cache-Control", "no-store")

        if (action === "e3-request-login-otp") {
          try {
            await sendAuthenticaOtp({ phone: verifiedPhone, method: "sms" })
            return res.status(200).json({ success: true, message: "تم إرسال رمز التحقق عبر الرسائل النصية" })
          } catch (error) {
            logError("Authentica Event3 OTP send", { code: error?.code, status: error?.status })
            const configurationError = error?.code === "AUTHENTICA_NOT_CONFIGURED"
            return res.status(configurationError ? 500 : 503).json({
              error: configurationError ? "خدمة رمز التحقق غير مهيأة" : "تعذّر إرسال رمز التحقق. حاول مرة أخرى.",
              retryable: !configurationError,
            })
          }
        }

        const otp = String(req.body?.otp || "").trim()
        if (!/^\d{4,8}$/.test(otp)) return res.status(400).json({ error: "أدخل رمز التحقق الصحيح" })
        try {
          const verification = await verifyAuthenticaOtp({ phone: verifiedPhone, otp })
          if (!verification.verified) {
            return res.status(400).json({ error: "رمز التحقق غير صحيح أو منتهي الصلاحية" })
          }
          const participantName = String(matchedParticipant.name || "").trim()
          return res.status(200).json({
            success: true,
            token: matchedParticipant.secure_token,
            secure_token: matchedParticipant.secure_token,
            assigned_number: matchedParticipant.assigned_number,
            name: participantName,
            session_scope: "participant",
          })
        } catch (error) {
          logError("Authentica Event3 OTP verify", { code: error?.code, status: error?.status })
          const configurationError = error?.code === "AUTHENTICA_NOT_CONFIGURED"
          return res.status(configurationError ? 500 : 503).json({
            error: configurationError ? "خدمة رمز التحقق غير مهيأة" : "تعذّر التحقق من الرمز. حاول مرة أخرى.",
            retryable: !configurationError,
          })
        }
      }

      if (!participant) return res.status(401).json({ error: "Invalid or missing token" })

      // Resolve only the people this participant actually shared a table with
      // during Event3's group rounds. Reused by the optional group reflection
      // flow so clients cannot submit rankings for arbitrary participants.
      const getE3GroupPeople = async (groupRound) => {
        const round = Number(groupRound)
        if (!Number.isInteger(round) || round < 1 || round > groupRoundCount) throw new Error(`Group round must be between 1 and ${groupRoundCount}`)
        const { data: assignments, error: assignmentsError } = await supabase
          .from("session_assignments")
          .select("round,table_number,participant_id")
          .eq("match_id", E3_MATCH_ID)
          .eq("event_id", currentEventId)
          .eq("round", round)

        if (assignmentsError) throw assignmentsError

        const myTables = new Map()
        for (const row of assignments || []) {
          if (row.participant_id === myNumber) myTables.set(row.round, row.table_number)
        }

        const metByNumber = new Map()
        for (const row of assignments || []) {
          if (row.participant_id === myNumber || myTables.get(row.round) !== row.table_number) continue
          const previous = metByNumber.get(row.participant_id) || { number: row.participant_id, rounds: [], table_numbers: [] }
          if (!previous.rounds.includes(row.round)) previous.rounds.push(row.round)
          if (!previous.table_numbers.includes(row.table_number)) previous.table_numbers.push(row.table_number)
          metByNumber.set(row.participant_id, previous)
        }

        const met = [...metByNumber.values()].sort((a, b) => a.rounds[0] - b.rounds[0] || a.number - b.number)
        if (met.length === 0) return []

        const { data: participantRows, error: participantError } = await supabase
          .from("participants")
          .select("assigned_number,name,survey_data")
          .eq("match_id", MAIN_MATCH)
          .in("assigned_number", met.map(person => person.number))

        if (participantError) throw participantError

        const names = new Map()
        for (const row of participantRows || []) {
          let survey = row.survey_data || {}
          if (typeof survey === "string") {
            try { survey = JSON.parse(survey || "{}") } catch { survey = {} }
          }
          names.set(row.assigned_number, row.name || survey?.answers?.name || survey?.name || `#${row.assigned_number}`)
        }

        return met.map(person => ({
          ...person,
          first_name: firstName(names.get(person.number)),
        }))
      }

      // e3-get-assignment
      if (action === "e3-get-assignment") {
        const { round } = req.body
        const requestedRound = Number(round)
        if (!Number.isInteger(requestedRound)) return res.status(400).json({ error: "Invalid assignment round" })
        if (requestedRound >= 1 && requestedRound <= groupRoundCount) {
          if (requestedRound > reachedGroupRounds) return res.status(409).json({ error: "This group round has not started yet", code: "EVENT3_ROUND_NOT_REACHED" })
        } else if (requestedRound === 20) {
          if (!EVENT3_FIRST_MATCH_REVEAL_PHASES.has(activeEvent3Phase)) return res.status(409).json({ error: "The first match has not been revealed yet", code: "EVENT3_MATCH_NOT_REVEALED" })
        } else if (requestedRound === 30) {
          if (!EVENT3_SECOND_MATCH_REVEAL_PHASES.has(activeEvent3Phase)) return res.status(409).json({ error: "The second match has not been revealed yet", code: "EVENT3_MATCH_NOT_REVEALED" })
        } else if (requestedRound === 40 && isChoiceOnlyEvent3(eventFormat)) {
          if (!EVENT3_THIRD_MATCH_REVEAL_PHASES.has(activeEvent3Phase)) return res.status(409).json({ error: "The third match has not been revealed yet", code: "EVENT3_MATCH_NOT_REVEALED" })
        } else {
          return res.status(400).json({ error: "Invalid assignment round" })
        }
        const { data: sa } = await supabase.from("session_assignments").select("table_number").eq("match_id", E3_MATCH_ID).eq("event_id", currentEventId).eq("round", requestedRound).eq("participant_id", myNumber).maybeSingle()
        if (!sa) return res.status(404).json({ error: "No assignment found" })
        const { data: mates } = await supabase.from("session_assignments").select("participant_id").eq("match_id", E3_MATCH_ID).eq("event_id", currentEventId).eq("round", requestedRound).eq("table_number", sa.table_number).neq("participant_id", myNumber)
        const mateNums = (mates || []).map(t => t.participant_id)
        const { data: mateData } = await supabase.from("participants").select("assigned_number,name,survey_data,gender").eq("match_id", MAIN_MATCH).in("assigned_number", mateNums)
        const tablemates = (mateData || []).map(p => { const sd = typeof p.survey_data === "string" ? JSON.parse(p.survey_data || "{}") : (p.survey_data || {}); return { number: p.assigned_number, first_name: firstName(p.name || sd?.answers?.name || sd?.name), gender: p.gender || sd?.answers?.gender || sd?.gender || null } })
        return res.status(200).json({ round: requestedRound, table: sa.table_number, tablemates })
      }

      // e3-get-participants-met
      if (action === "e3-get-participants-met") {
        if (reachedGroupRounds < 1) return res.status(409).json({ error: "No group round has started yet", code: "EVENT3_ROUND_NOT_REACHED" })
        const requestedCompletedRounds = Number(req.body.completed_rounds ?? reachedGroupRounds)
        if (!Number.isInteger(requestedCompletedRounds) || requestedCompletedRounds < 1 || requestedCompletedRounds > reachedGroupRounds) {
          return res.status(409).json({ error: "That group round has not been reached yet", code: "EVENT3_ROUND_NOT_REACHED" })
        }
        const completedRounds = requestedCompletedRounds
        const { data: allRounds } = await supabase.from("session_assignments").select("round,table_number,participant_id").eq("match_id", E3_MATCH_ID).eq("event_id", currentEventId).eq("participant_id", myNumber).lte("round", completedRounds)
        if (!allRounds || allRounds.length === 0) return res.status(404).json({ error: "No session assignments found" })
        const metNumbers = []
        const seenNums = new Set()
        for (const row of allRounds.sort((a, b) => a.round - b.round)) {
          const { data: mates } = await supabase.from("session_assignments").select("participant_id").eq("match_id", E3_MATCH_ID).eq("event_id", currentEventId).eq("round", row.round).eq("table_number", row.table_number).neq("participant_id", myNumber)
          for (const m of mates || []) {
            if (m.participant_id !== myNumber && !seenNums.has(m.participant_id)) {
              seenNums.add(m.participant_id)
              metNumbers.push({ number: m.participant_id, round: row.round })
            }
          }
        }
        if (metNumbers.length === 0) return res.status(200).json({ people: [], existing_rankings: {}, already_submitted: false })
        const nums = metNumbers.map(m => m.number)
        const { data: pdata } = await supabase.from("participants").select("assigned_number,name,survey_data").eq("match_id", MAIN_MATCH).in("assigned_number", nums)
        const nameMap = {}
        for (const p of pdata || []) { const sd = typeof p.survey_data === "string" ? JSON.parse(p.survey_data || "{}") : (p.survey_data || {}); nameMap[p.assigned_number] = p.name || sd?.answers?.name || sd?.name || `#${p.assigned_number}` }
        // Build table_number map from session_assignments
        const tableMap = {}
        for (const row of allRounds) { const { data: mates } = await supabase.from("session_assignments").select("participant_id").eq("match_id", E3_MATCH_ID).eq("event_id", currentEventId).eq("round", row.round).eq("table_number", row.table_number).neq("participant_id", myNumber); for (const m of mates || []) { if (!tableMap[m.participant_id]) tableMap[m.participant_id] = row.table_number } }
        const { data: existingRankings, error: rankingsError } = await supabase.from("participant_rankings").select("ranked_number,rank").eq("match_id", E3_MATCH_ID).eq("event_id", currentEventId).eq("ranker_number", myNumber)
        if (rankingsError) throw rankingsError
        const { data: rankingState, error: rankingStateError } = await supabase.from("event_state").select("phase,test_mode_active,test_mode_snapshot").eq("match_id", E3_MATCH_ID).single()
        if (rankingStateError) throw rankingStateError
        const sessionKey = rankingState.test_mode_active ? (rankingState.test_mode_snapshot?.started_at || "legacy-test") : "live"
        const { data: draft, error: draftError } = await supabase.from("event3_ranking_drafts").select("ranked_numbers,revision,submitted")
          .eq("match_id", E3_MATCH_ID).eq("event_id", currentEventId).eq("ranker_number", myNumber)
          .eq("completed_rounds", completedRounds).eq("session_key", sessionKey).maybeSingle()
        if (draftError) throw draftError
        const rankingMap = {}
        for (const r of existingRankings || []) rankingMap[r.ranked_number] = r.rank
        const pendingDraft = rankingState.phase === `ranking${completedRounds}` && draft && !draft.submitted
          && draft.ranked_numbers.length === nums.length && nums.every(n => draft.ranked_numbers.includes(n))
        return res.status(200).json({ people: metNumbers.map(m => ({ number: m.number, first_name: firstName(nameMap[m.number]), round: m.round, table_number: tableMap[m.number] || null })), existing_rankings: rankingMap,
          event_id: currentEventId, draft_order: pendingDraft ? draft.ranked_numbers : null, draft_revision: draft?.revision || 0,
          already_submitted: !pendingDraft && nums.every(n => rankingMap[n] !== undefined) })
      }

      // Optional absolute feedback about individual tablemates. This is
      // deliberately separate from participant_rankings and never affects
      // live matching.
      if (action === "e3-get-group-reflection") {
        const groupRound = Number(req.body.group_round)
        if (!Number.isInteger(groupRound) || groupRound < 1 || groupRound > groupRoundCount) return res.status(400).json({ error: `group_round must be between 1 and ${groupRoundCount}` })
        if (groupRound > reachedGroupRounds) return res.status(409).json({ error: "That group round has not been reached yet", code: "EVENT3_ROUND_NOT_REACHED" })
        const [people, feedbackResult] = await Promise.all([
          getE3GroupPeople(groupRound),
          supabase.from("event3_group_member_feedback")
            .select("member_number,experience,tags,organizer_note,submitted_at,updated_at")
            .eq("match_id", E3_MATCH_ID)
            .eq("event_id", currentEventId)
            .eq("group_round", groupRound)
            .eq("reviewer_number", myNumber)
            .eq("is_test_mode", requestTestMode)
            .order("member_number", { ascending: true }),
        ])
        if (feedbackResult.error) return res.status(500).json({ error: feedbackResult.error.message })
        return res.status(200).json({ people, feedback: feedbackResult.data || [] })
      }

      if (action === "e3-submit-group-reflection") {
        const groupRound = Number(req.body.group_round)
        if (!Number.isInteger(groupRound) || groupRound < 1 || groupRound > groupRoundCount) return res.status(400).json({ error: `group_round must be between 1 and ${groupRoundCount}` })
        if (groupRound > reachedGroupRounds) return res.status(409).json({ error: "That group round has not been reached yet", code: "EVENT3_ROUND_NOT_REACHED" })
        const people = await getE3GroupPeople(groupRound)
        const allowedNumbers = new Set(people.map(person => person.number))
        const normalized = normalizeGroupMemberFeedback({
          entries: req.body.entries,
          groupRound,
          reviewerNumber: myNumber,
          allowedNumbers,
        })
        if (normalized.error) return res.status(400).json({ error: normalized.error })
        let feedbackSave = await supabase.rpc("replace_event3_group_member_feedback_v2", {
          p_match_id: E3_MATCH_ID,
          p_event_id: currentEventId,
          p_group_round: groupRound,
          p_reviewer_number: myNumber,
          p_is_test_mode: requestTestMode,
          p_expected_started_at: requestTestMode ? (expectedEvent3SessionKey || null) : null,
          p_rows: normalized.value.entries,
        })
        const hardenedFeedbackMissing = feedbackSave.error?.code === "PGRST202"
          || String(feedbackSave.error?.message || "").includes("replace_event3_group_member_feedback_v2")
        if (hardenedFeedbackMissing && !isChoiceOnlyEvent3(eventFormat)) {
          // Rolling deployments may briefly run the new API before the new RPC.
          // Classic editions retain their established six-argument path during
          // that window; choice-only editions require the hardened migration.
          feedbackSave = await supabase.rpc("replace_event3_group_member_feedback", {
            p_match_id: E3_MATCH_ID,
            p_event_id: currentEventId,
            p_group_round: groupRound,
            p_reviewer_number: myNumber,
            p_is_test_mode: requestTestMode,
            p_rows: normalized.value.entries,
          })
        }
        const { data: savedCount, error } = feedbackSave

        if (error) {
          const sessionChanged = error.code === "55000"
          const migrationRequired = hardenedFeedbackMissing && isChoiceOnlyEvent3(eventFormat)
          return res.status(migrationRequired ? 501 : sessionChanged ? 409 : 500).json({
            error: error.message,
            code: sessionChanged ? "EVENT3_SESSION_CHANGED" : undefined,
            retryable: sessionChanged,
            migration_required: migrationRequired,
          })
        }
        return res.status(200).json({ message: "Group member feedback saved", saved_count: savedCount || normalized.value.entries.length })
      }

      // Drafts and final submissions share the event lock with phase advancement.
      if (action === "e3-submit-ranking" || action === "e3-save-ranking-draft") {
        const { ranked_list, auto_saved } = req.body
        if (!Array.isArray(ranked_list) || ranked_list.length === 0) return res.status(400).json({ error: "Ranking list cannot be empty" })
        const normalizedRanking = ranked_list.map(Number)
        if (normalizedRanking.some(num => !Number.isInteger(num) || num <= 0 || num === myNumber) || new Set(normalizedRanking).size !== normalizedRanking.length) {
          return res.status(400).json({ error: "Ranking list contains an invalid or duplicate participant" })
        }
        const { data: phaseState, error: phaseError } = await supabase.from("event_state").select("phase").eq("match_id", E3_MATCH_ID).single()
        if (phaseError) throw phaseError
        // Explicit scope keeps a late first-round request from being validated as round two.
        // The fallback supports phones still running the previous client.
        const phaseRankingRound = Number(String(phaseState.phase || "").match(/^ranking([123])$/)?.[1] || groupRoundCount)
        const completedRounds = Number(req.body.completed_rounds ?? phaseRankingRound)
        const revision = Number(req.body.revision ?? Date.now())
        if (!Number.isInteger(completedRounds) || completedRounds < 1 || completedRounds > reachedGroupRounds || !Number.isSafeInteger(revision) || revision < 0) {
          return res.status(400).json({ error: "Invalid ranking round or revision" })
        }
        if (req.body.event_id != null && Number(req.body.event_id) !== currentEventId) {
          return res.status(409).json({ error: "Event has changed; refresh before saving" })
        }
        const { data, error } = await supabase.rpc("save_event3_ranking_v2", {
          p_match_id: E3_MATCH_ID, p_event_id: currentEventId, p_ranker_number: myNumber,
          p_completed_rounds: completedRounds, p_ranked_numbers: normalizedRanking,
          p_revision: revision, p_draft_only: action === "e3-save-ranking-draft", p_auto_saved: !!auto_saved,
          p_expected_test_mode: requestTestMode,
          p_expected_started_at: requestTestMode ? (expectedEvent3SessionKey || null) : null,
        })
        if (error) {
          const sessionChanged = error.code === "55000"
          const migrationRequired = error.code === "PGRST202" || String(error.message || "").includes("save_event3_ranking_v2")
          return res.status(migrationRequired ? 501 : error.code === "22023" ? 400 : sessionChanged ? 409 : 503).json({
            error: error.message,
            code: sessionChanged ? "EVENT3_SESSION_CHANGED" : undefined,
            retryable: sessionChanged || (!migrationRequired && error.code !== "22023"),
            migration_required: migrationRequired,
          })
        }
        if (data.closed && !data.complete) return res.status(409).json({ error: "The ranking phase has closed. Please contact the organizer.", code: "RANKING_CLOSED" })
        if (data.stale && !data.complete) return res.status(409).json({ error: "A newer ranking was saved. Refresh to load it.", code: "RANKING_STALE" })
        return res.status(200).json({ ...data, message: "Ranking saved", event_id: currentEventId })
      }

      // e3-get-phase2-reveal
      if (action === "e3-get-phase2-reveal") {
        if (!EVENT3_FIRST_MATCH_REVEAL_PHASES.has(activeEvent3Phase)) {
          return res.status(409).json({ error: "The first match has not been revealed yet", code: "EVENT3_MATCH_NOT_REVEALED" })
        }
        const { data: matchRow } = await supabase.from("event3_matches").select("phase2_partner,phase2_word,phase2_score,phase2_score_model_version,phase2_score_content_hash,phase2_score_snapshot,phase2_feedback").eq("match_id", E3_MATCH_ID).eq("event_id", currentEventId).eq("participant_number", myNumber).maybeSingle()
        if (!matchRow || !matchRow.phase2_partner) return res.status(404).json({ error: "No Phase 2 match found yet" })
        const [{ data: partner }, { data: tableRow }, { data: myRankings }, { data: partnerRankedMe }] = await Promise.all([
          supabase.from("participants").select("assigned_number,name,survey_data,mbti_personality_type,age").eq("match_id", MAIN_MATCH).eq("assigned_number", matchRow.phase2_partner).single(),
          supabase.from("session_assignments").select("table_number").eq("match_id", E3_MATCH_ID).eq("event_id", currentEventId).eq("round", 20).eq("participant_id", myNumber).maybeSingle(),
          supabase.from("participant_rankings").select("ranked_number").eq("match_id", E3_MATCH_ID).eq("event_id", currentEventId).eq("ranker_number", myNumber),
          supabase.from("participant_rankings").select("ranker_number").eq("match_id", E3_MATCH_ID).eq("event_id", currentEventId).eq("ranker_number", matchRow.phase2_partner).eq("ranked_number", myNumber).maybeSingle(),
        ])
        const myRankedNumbers = new Set((myRankings || []).map(r => r.ranked_number))
        const iRankedPartner = myRankedNumbers.has(matchRow.phase2_partner)
        const partnerRankedMeBack = !!partnerRankedMe
        const isBackup = !iRankedPartner && !partnerRankedMeBack
        const sd = typeof partner?.survey_data === "string" ? JSON.parse(partner.survey_data || "{}") : (partner?.survey_data || {})
        const getF = (p, k) => { try { const s = typeof p.survey_data === "string" ? JSON.parse(p.survey_data || "{}") : (p.survey_data || {}); return s?.answers?.[k] ?? s?.[k] ?? p?.[k] ?? "" } catch { return "" } }
        const partnerMbti = (getF(partner, "mbti_type") || partner?.mbti_personality_type || "").toUpperCase()
        const partnerAttachment = getF(partner, "attachment_style") || ""
        const partnerCommunication = getF(partner, "communication_style") || ""
        const partnerAge = parseInt(getF(partner, "age") || partner?.age) || null
        // Use the score persisted when the match was made. If an older row is
        // missing it, fall back to the current versioned cache—not a second,
        // unrelated MBTI/age/attachment formula.
        const hasStoredPhase2Score = matchRow.phase2_score !== null
          && matchRow.phase2_score !== undefined
          && Number.isFinite(Number(matchRow.phase2_score))
        // A stored event-time snapshot always wins. If this legacy row has a
        // stored total but no snapshot, do not attach today's components to it.
        let breakdown = participantBreakdownFromScoreSnapshot(matchRow.phase2_score_snapshot, {
          scoreModelVersion: matchRow.phase2_score_model_version,
          scoreContentHash: matchRow.phase2_score_content_hash,
          storedTotal: matchRow.phase2_score,
        })
        if (!isChoiceOnlyEvent3(eventFormat) && !breakdown && !hasStoredPhase2Score) {
          breakdown = await fetchParticipantBalancedCacheBreakdown(myNumber, matchRow.phase2_partner)
        }
        const phase2Score = isChoiceOnlyEvent3(eventFormat)
          ? null
          : hasStoredPhase2Score
          ? Number(matchRow.phase2_score)
          : Number(breakdown?.total ?? 0)
        return res.status(200).json({ event_format: eventFormat, partner_number: matchRow.phase2_partner, partner_first_name: firstName(partner?.name || sd?.answers?.name || sd?.name), table_number: tableRow?.table_number ?? null, word_submitted: !!matchRow.phase2_word, my_word: matchRow.phase2_word || null, feedback_submitted: !!matchRow.phase2_feedback, compatibility_score: phase2Score, score_model_version: isChoiceOnlyEvent3(eventFormat) ? null : breakdown?.scoreModelVersion ?? null, breakdown: isChoiceOnlyEvent3(eventFormat) ? null : breakdown, partner_mbti: partnerMbti, partner_attachment: partnerAttachment, partner_communication: partnerCommunication, partner_age: partnerAge, is_backup: isBackup, mutual_choice: iRankedPartner && partnerRankedMeBack })
      }

      // e3-submit-phase2-word
      if (action === "e3-submit-phase2-word") {
        const normalizedWord = normalizeEvent3MemoryWord(req.body.word)
        if (normalizedWord.error) return res.status(400).json({ error: normalizedWord.error })
        const word = normalizedWord.value
        const { data: currentMatch, error: matchError } = await supabase.from("event3_matches")
          .select("phase2_partner").eq("match_id", E3_MATCH_ID).eq("event_id", currentEventId)
          .eq("participant_number", myNumber).maybeSingle()
        if (matchError) {
          const migrationRequired = ["42703", "PGRST204"].includes(matchError.code)
          return res.status(migrationRequired ? 501 : 500).json({ error: matchError.message, migration_required: migrationRequired })
        }
        if (!currentMatch?.phase2_partner) return res.status(404).json({ error: "No Phase 2 match found yet" })
        const saved = await saveEvent3MatchInteraction({
          slot: 1, partner: currentMatch.phase2_partner, operation: "word", payload: { word },
        })
        if (saved.response) return saved.response
        if (saved.fallback) {
          const { error } = await supabase.from("event3_matches").update({ phase2_word: word }).eq("match_id", E3_MATCH_ID).eq("event_id", currentEventId).eq("participant_number", myNumber)
          if (error) return res.status(500).json({ error: error.message })
        }
        return res.status(200).json({ message: "Word saved" })
      }

      // e3-get-phase3-reveal
      if (action === "e3-get-phase3-reveal") {
        if (!EVENT3_SECOND_MATCH_REVEAL_PHASES.has(activeEvent3Phase)) {
          return res.status(409).json({ error: "The second match has not been revealed yet", code: "EVENT3_MATCH_NOT_REVEALED" })
        }
        const { data: matchRow } = await supabase.from("event3_matches").select("phase3_partner,phase3_score,phase3_score_model_version,phase3_score_content_hash,phase3_score_snapshot,phase3_word,phase2_partner,phase3_feedback").eq("match_id", E3_MATCH_ID).eq("event_id", currentEventId).eq("participant_number", myNumber).maybeSingle()
        if (!matchRow || !matchRow.phase3_partner) return res.status(404).json({ error: "No Phase 3 match found yet" })
        const { data: partner } = await supabase.from("participants").select("assigned_number,name,survey_data,mbti_personality_type,age").eq("match_id", MAIN_MATCH).eq("assigned_number", matchRow.phase3_partner).single()
        const sd = typeof partner?.survey_data === "string" ? JSON.parse(partner.survey_data || "{}") : (partner?.survey_data || {})
        const getF = (p, k) => { try { const s = typeof p.survey_data === "string" ? JSON.parse(p.survey_data || "{}") : (p.survey_data || {}); return s?.answers?.[k] ?? s?.[k] ?? p?.[k] ?? "" } catch { return "" } }
        const partnerMbti = (getF(partner, "mbti_type") || partner?.mbti_personality_type || "").toUpperCase()
        const partnerAttachment = getF(partner, "attachment_style") || ""
        const partnerCommunication = getF(partner, "communication_style") || ""
        const partnerAge = parseInt(getF(partner, "age") || partner?.age) || null
        const hasStoredPhase3Score = matchRow.phase3_score !== null
          && matchRow.phase3_score !== undefined
          && Number.isFinite(Number(matchRow.phase3_score))
        let breakdown = participantBreakdownFromScoreSnapshot(matchRow.phase3_score_snapshot, {
          scoreModelVersion: matchRow.phase3_score_model_version,
          scoreContentHash: matchRow.phase3_score_content_hash,
          storedTotal: matchRow.phase3_score,
        })
        if (!isChoiceOnlyEvent3(eventFormat) && !breakdown && !hasStoredPhase3Score) {
          breakdown = await fetchParticipantBalancedCacheBreakdown(myNumber, matchRow.phase3_partner)
        }
        // Fetch table number from round 30 session_assignments
        const { data: tableRow } = await supabase.from("session_assignments").select("table_number").eq("match_id", E3_MATCH_ID).eq("event_id", currentEventId).eq("round", 30).eq("participant_id", myNumber).maybeSingle()
        return res.status(200).json({ event_format: eventFormat, partner_number: matchRow.phase3_partner, partner_first_name: firstName(partner?.name || sd?.answers?.name || sd?.name), compatibility_score: isChoiceOnlyEvent3(eventFormat) ? null : matchRow.phase3_score ?? breakdown?.total ?? 0, score_model_version: isChoiceOnlyEvent3(eventFormat) ? null : breakdown?.scoreModelVersion ?? null, same_as_phase2: matchRow.phase2_partner === matchRow.phase3_partner, word_submitted: !!matchRow.phase3_word, my_word: matchRow.phase3_word || null, feedback_submitted: !!matchRow.phase3_feedback, partner_mbti: partnerMbti, partner_attachment: partnerAttachment, partner_communication: partnerCommunication, partner_age: partnerAge, breakdown: isChoiceOnlyEvent3(eventFormat) ? null : breakdown, table_number: tableRow?.table_number ?? null })
      }

      // e3-submit-phase3-word
      if (action === "e3-submit-phase3-word") {
        const normalizedWord = normalizeEvent3MemoryWord(req.body.word)
        if (normalizedWord.error) return res.status(400).json({ error: normalizedWord.error })
        const word = normalizedWord.value
        const { data: currentMatch, error: matchError } = await supabase.from("event3_matches")
          .select("phase3_partner").eq("match_id", E3_MATCH_ID).eq("event_id", currentEventId)
          .eq("participant_number", myNumber).maybeSingle()
        if (matchError) {
          const migrationRequired = ["42703", "PGRST204"].includes(matchError.code)
          return res.status(migrationRequired ? 501 : 500).json({ error: matchError.message, migration_required: migrationRequired })
        }
        if (!currentMatch?.phase3_partner) return res.status(404).json({ error: "No Phase 3 match found yet" })
        const saved = await saveEvent3MatchInteraction({
          slot: 2, partner: currentMatch.phase3_partner, operation: "word", payload: { word },
        })
        if (saved.response) return saved.response
        if (saved.fallback) {
          const { error } = await supabase.from("event3_matches").update({ phase3_word: word }).eq("match_id", E3_MATCH_ID).eq("event_id", currentEventId).eq("participant_number", myNumber)
          if (error) return res.status(500).json({ error: error.message })
        }
        return res.status(200).json({ message: "Word saved" })
      }

      // Choice-only Match 3 reveal and word
      if (action === "e3-get-phase4-reveal") {
        if (!isChoiceOnlyEvent3(eventFormat)) return res.status(404).json({ error: "This edition has no third choice match" })
        if (!EVENT3_THIRD_MATCH_REVEAL_PHASES.has(activeEvent3Phase)) {
          return res.status(409).json({ error: "The third choice match has not been revealed yet", code: "EVENT3_MATCH_NOT_REVEALED" })
        }
        const { data: matchRow, error: matchError } = await supabase.from("event3_matches")
          .select("phase4_partner,phase4_word,phase4_feedback,phase2_partner,phase3_partner")
          .eq("match_id", E3_MATCH_ID).eq("event_id", currentEventId)
          .eq("participant_number", myNumber).maybeSingle()
        if (matchError) {
          const migrationRequired = ["42703", "PGRST204"].includes(matchError.code)
          return res.status(migrationRequired ? 501 : 500).json({ error: matchError.message, migration_required: migrationRequired })
        }
        if (!matchRow?.phase4_partner) return res.status(404).json({ error: "No third choice match found yet" })
        const [{ data: partner }, { data: tableRow }, { data: partnerRankedMe }] = await Promise.all([
          supabase.from("participants").select("assigned_number,name,survey_data,mbti_personality_type,age").eq("match_id", MAIN_MATCH).eq("assigned_number", matchRow.phase4_partner).single(),
          supabase.from("session_assignments").select("table_number").eq("match_id", E3_MATCH_ID).eq("event_id", currentEventId).eq("round", 40).eq("participant_id", myNumber).maybeSingle(),
          supabase.from("participant_rankings").select("ranker_number").eq("match_id", E3_MATCH_ID).eq("event_id", currentEventId).eq("ranker_number", matchRow.phase4_partner).eq("ranked_number", myNumber).maybeSingle(),
        ])
        const sd = typeof partner?.survey_data === "string" ? JSON.parse(partner.survey_data || "{}") : (partner?.survey_data || {})
        const getF = (p, k) => { try { const s = typeof p.survey_data === "string" ? JSON.parse(p.survey_data || "{}") : (p.survey_data || {}); return s?.answers?.[k] ?? s?.[k] ?? p?.[k] ?? "" } catch { return "" } }
        return res.status(200).json({
          event_format: eventFormat,
          partner_number: matchRow.phase4_partner,
          partner_first_name: firstName(partner?.name || sd?.answers?.name || sd?.name),
          table_number: tableRow?.table_number ?? null,
          word_submitted: !!matchRow.phase4_word,
          my_word: matchRow.phase4_word || null,
          feedback_submitted: !!matchRow.phase4_feedback,
          compatibility_score: null,
          score_model_version: null,
          breakdown: null,
          partner_mbti: (getF(partner, "mbti_type") || partner?.mbti_personality_type || "").toUpperCase(),
          partner_attachment: getF(partner, "attachment_style") || "",
          partner_communication: getF(partner, "communication_style") || "",
          partner_age: parseInt(getF(partner, "age") || partner?.age) || null,
          mutual_choice: !!partnerRankedMe,
          distinct_from_prior_matches: matchRow.phase4_partner !== matchRow.phase2_partner && matchRow.phase4_partner !== matchRow.phase3_partner,
        })
      }

      if (action === "e3-submit-phase4-word") {
        if (!isChoiceOnlyEvent3(eventFormat)) return res.status(404).json({ error: "This edition has no third choice match" })
        const normalizedWord = normalizeEvent3MemoryWord(req.body.word)
        if (normalizedWord.error) return res.status(400).json({ error: normalizedWord.error })
        const word = normalizedWord.value
        const { data: currentMatch, error: matchError } = await supabase.from("event3_matches")
          .select("phase4_partner").eq("match_id", E3_MATCH_ID).eq("event_id", currentEventId)
          .eq("participant_number", myNumber).maybeSingle()
        if (matchError) {
          const migrationRequired = ["42703", "PGRST204"].includes(matchError.code)
          return res.status(migrationRequired ? 501 : 500).json({ error: matchError.message, migration_required: migrationRequired })
        }
        if (!currentMatch?.phase4_partner) return res.status(404).json({ error: "No third choice match found yet" })
        const saved = await saveEvent3MatchInteraction({
          slot: 3, partner: currentMatch.phase4_partner, operation: "word", payload: { word },
        })
        if (saved.response) return saved.response
        if (saved.fallback) return res.status(501).json({ error: "The third choice migration is required", migration_required: true })
        return res.status(200).json({ message: "Word saved" })
      }

      // e3-submit-phase2-feedback (first-write-wins)
      if (action === "e3-submit-phase2-feedback") {
        const normalizedFeedback = normalizeEvent3FeedbackPayload(req.body.feedback)
        if (normalizedFeedback.error) return res.status(400).json({ error: normalizedFeedback.error })
        const fb = normalizedFeedback.value
        const { data: currentMatch, error: matchError } = await supabase.from("event3_matches")
          .select("phase2_partner,phase2_feedback").eq("match_id", E3_MATCH_ID).eq("event_id", currentEventId)
          .eq("participant_number", myNumber).maybeSingle()
        if (matchError) return res.status(500).json({ error: matchError.message })
        if (!currentMatch?.phase2_partner) return res.status(404).json({ error: "No Phase 2 match found yet" })
        const saved = await saveEvent3MatchInteraction({
          slot: 1, partner: currentMatch.phase2_partner, operation: "feedback", payload: fb,
        })
        if (saved.response) return saved.response
        if (saved.data?.already_saved) return res.status(200).json({ message: "Feedback already submitted" })
        if (saved.fallback) {
          if (currentMatch.phase2_feedback) return res.status(200).json({ message: "Feedback already submitted" })
          const { error } = await supabase.from("event3_matches").update({ phase2_feedback: fb }).eq("match_id", E3_MATCH_ID).eq("event_id", currentEventId).eq("participant_number", myNumber)
          if (error) return res.status(500).json({ error: error.message })
        }
        return res.status(200).json({ message: "Feedback saved" })
      }
      // e3-submit-phase3-feedback (first-write-wins)
      if (action === "e3-submit-phase3-feedback") {
        const normalizedFeedback = normalizeEvent3FeedbackPayload(req.body.feedback)
        if (normalizedFeedback.error) return res.status(400).json({ error: normalizedFeedback.error })
        const fb = normalizedFeedback.value
        const { data: currentMatch, error: matchError } = await supabase.from("event3_matches")
          .select("phase3_partner,phase3_feedback").eq("match_id", E3_MATCH_ID).eq("event_id", currentEventId)
          .eq("participant_number", myNumber).maybeSingle()
        if (matchError) return res.status(500).json({ error: matchError.message })
        if (!currentMatch?.phase3_partner) return res.status(404).json({ error: "No Phase 3 match found yet" })
        const saved = await saveEvent3MatchInteraction({
          slot: 2, partner: currentMatch.phase3_partner, operation: "feedback", payload: fb,
        })
        if (saved.response) return saved.response
        if (saved.data?.already_saved) return res.status(200).json({ message: "Feedback already submitted" })
        if (saved.fallback) {
          if (currentMatch.phase3_feedback) return res.status(200).json({ message: "Feedback already submitted" })
          const existingPref = currentMatch.phase3_feedback?.match_preference
          const mergedFb = existingPref && fb.match_preference === undefined ? { ...fb, match_preference: existingPref } : fb
          const { error } = await supabase.from("event3_matches").update({ phase3_feedback: mergedFb }).eq("match_id", E3_MATCH_ID).eq("event_id", currentEventId).eq("participant_number", myNumber)
          if (error) return res.status(500).json({ error: error.message })
        }
        return res.status(200).json({ message: "Feedback saved" })
      }

      if (action === "e3-submit-phase4-feedback") {
        if (!isChoiceOnlyEvent3(eventFormat)) return res.status(404).json({ error: "This edition has no third choice match" })
        const normalizedFeedback = normalizeEvent3FeedbackPayload(req.body.feedback)
        if (normalizedFeedback.error) return res.status(400).json({ error: normalizedFeedback.error })
        const fb = normalizedFeedback.value
        const { data: currentMatch, error: matchError } = await supabase.from("event3_matches")
          .select("phase4_partner").eq("match_id", E3_MATCH_ID).eq("event_id", currentEventId)
          .eq("participant_number", myNumber).maybeSingle()
        if (matchError) {
          const migrationRequired = ["42703", "PGRST204"].includes(matchError.code)
          return res.status(migrationRequired ? 501 : 500).json({ error: matchError.message, migration_required: migrationRequired })
        }
        if (!currentMatch?.phase4_partner) return res.status(404).json({ error: "No third choice match found yet" })
        const saved = await saveEvent3MatchInteraction({
          slot: 3, partner: currentMatch.phase4_partner, operation: "feedback", payload: fb,
        })
        if (saved.response) return saved.response
        if (saved.data?.already_saved) return res.status(200).json({ message: "Feedback already submitted" })
        if (saved.fallback) return res.status(501).json({ error: "The third choice migration is required", migration_required: true })
        return res.status(200).json({ message: "Feedback saved" })
      }

      // e3-submit-match-preference
      if (action === "e3-submit-match-preference") {
        const rawPreference = req.body.preference
        const preference = isChoiceOnlyEvent3(eventFormat)
          ? ({ choice: "first", algorithm: "second", both: "multiple", neither: "none" }[rawPreference] || rawPreference)
          : rawPreference
        const allowedPreferences = isChoiceOnlyEvent3(eventFormat)
          ? ["first", "second", "third", "multiple", "none"]
          : ["choice", "algorithm", "both", "neither"]
        if (!preference || !allowedPreferences.includes(preference)) {
          return res.status(400).json({ error: "Invalid preference" })
        }
        const partnerField = isChoiceOnlyEvent3(eventFormat) ? "phase4_partner" : "phase3_partner"
        const { data: currentMatch, error: matchError } = await supabase.from("event3_matches")
          .select(`${partnerField},phase3_feedback`).eq("match_id", E3_MATCH_ID).eq("event_id", currentEventId)
          .eq("participant_number", myNumber).maybeSingle()
        if (matchError) {
          const migrationRequired = isChoiceOnlyEvent3(eventFormat) && ["42703", "PGRST204"].includes(matchError.code)
          return res.status(migrationRequired ? 501 : 500).json({ error: matchError.message, migration_required: migrationRequired })
        }
        const expectedPartner = currentMatch?.[partnerField]
        if (!expectedPartner) return res.status(404).json({ error: "No final match found yet" })
        const saved = await saveEvent3MatchInteraction({
          slot: isChoiceOnlyEvent3(eventFormat) ? 3 : 2, partner: expectedPartner, operation: "preference", payload: { preference },
        })
        if (saved.response) return saved.response
        if (saved.fallback) {
          const { error } = await supabase.from("event3_matches").update({ match_preference: preference }).eq("match_id", E3_MATCH_ID).eq("event_id", currentEventId).eq("participant_number", myNumber)
          if (!error) return res.status(200).json({ message: "Preference saved", preference })
          // Column might not exist yet — fall back to storing inside phase3_feedback,
          // but MERGE with existing feedback instead of overwriting it, so we never
          // destroy already-submitted wantConnect/conversationQuality/etc.
          const mergedFeedback = { ...(currentMatch.phase3_feedback || {}), match_preference: preference }
          const { error: err2 } = await supabase.from("event3_matches").update({ phase3_feedback: mergedFeedback }).eq("match_id", E3_MATCH_ID).eq("event_id", currentEventId).eq("participant_number", myNumber)
          if (err2) return res.status(500).json({ error: err2.message })
        }
        return res.status(200).json({ message: "Preference saved", preference })
      }

      // e3-get-final-reveal
      if (action === "e3-get-final-reveal") {
        if (!["final", "final_reveal"].includes(activeEvent3Phase)) {
          return res.status(409).json({ error: "The final comparison has not been revealed yet", code: "EVENT3_MATCH_NOT_REVEALED" })
        }
        let matchLookup = await supabase.from("event3_matches").select("phase2_partner,phase3_partner,phase4_partner,phase2_word,phase3_word,phase4_word,phase2_score,phase2_score_model_version,phase2_score_content_hash,phase2_score_snapshot,phase3_score,phase3_score_model_version,phase3_score_content_hash,phase3_score_snapshot,match_preference").eq("match_id", E3_MATCH_ID).eq("event_id", currentEventId).eq("participant_number", myNumber).maybeSingle()
        if (matchLookup.error && !isChoiceOnlyEvent3(eventFormat)) {
          // Classic editions remain available while the optional Match 3
          // columns roll out with the choice-only migration.
          matchLookup = await supabase.from("event3_matches").select("phase2_partner,phase3_partner,phase2_word,phase3_word,phase2_score,phase2_score_model_version,phase2_score_content_hash,phase2_score_snapshot,phase3_score,phase3_score_model_version,phase3_score_content_hash,phase3_score_snapshot,match_preference").eq("match_id", E3_MATCH_ID).eq("event_id", currentEventId).eq("participant_number", myNumber).maybeSingle()
        }
        if (matchLookup.error) {
          const migrationRequired = isChoiceOnlyEvent3(eventFormat) && ["42703", "PGRST204"].includes(matchLookup.error.code)
          return res.status(migrationRequired ? 501 : 500).json({ error: matchLookup.error.message, migration_required: migrationRequired })
        }
        const matchRow = matchLookup.data
        if (!matchRow) return res.status(404).json({ error: "No match data found" })
        const partnerNums = [matchRow.phase2_partner, matchRow.phase3_partner, matchRow.phase4_partner].filter(Boolean)
        const { data: partners } = await supabase.from("participants").select("assigned_number,name,survey_data").eq("match_id", MAIN_MATCH).in("assigned_number", partnerNums)
        const pMap = {}
        for (const p of partners || []) { const sd = typeof p.survey_data === "string" ? JSON.parse(p.survey_data || "{}") : (p.survey_data || {}); pMap[p.assigned_number] = firstName(p.name || sd?.answers?.name || sd?.name) }
        let phase2Breakdown = participantBreakdownFromScoreSnapshot(matchRow.phase2_score_snapshot, {
          scoreModelVersion: matchRow.phase2_score_model_version,
          scoreContentHash: matchRow.phase2_score_content_hash,
          storedTotal: matchRow.phase2_score,
        })
        let phase3Breakdown = participantBreakdownFromScoreSnapshot(matchRow.phase3_score_snapshot, {
          scoreModelVersion: matchRow.phase3_score_model_version,
          scoreContentHash: matchRow.phase3_score_content_hash,
          storedTotal: matchRow.phase3_score,
        })
        const phase2HasStoredScore = matchRow.phase2_score !== null && matchRow.phase2_score !== undefined && Number.isFinite(Number(matchRow.phase2_score))
        const phase3HasStoredScore = matchRow.phase3_score !== null && matchRow.phase3_score !== undefined && Number.isFinite(Number(matchRow.phase3_score))
        const [phase2Fallback, phase3Fallback, eventStateRow] = await Promise.all([
          !isChoiceOnlyEvent3(eventFormat) && !phase2Breakdown && !phase2HasStoredScore && matchRow.phase2_partner
            ? fetchParticipantBalancedCacheBreakdown(myNumber, matchRow.phase2_partner)
            : Promise.resolve(null),
          !isChoiceOnlyEvent3(eventFormat) && !phase3Breakdown && !phase3HasStoredScore && matchRow.phase3_partner
            ? fetchParticipantBalancedCacheBreakdown(myNumber, matchRow.phase3_partner)
            : Promise.resolve(null),
          supabase.from("event_state").select("current_event_id").eq("match_id", MAIN_MATCH).single().then(r => r.data),
        ])
        phase2Breakdown = phase2Breakdown ?? phase2Fallback
        phase3Breakdown = phase3Breakdown ?? phase3Fallback
        return res.status(200).json({
          phase2: { partner_number: matchRow.phase2_partner, partner_first_name: pMap[matchRow.phase2_partner] || "—", word: matchRow.phase2_word || null, compatibility_score: isChoiceOnlyEvent3(eventFormat) ? null : matchRow.phase2_score ?? phase2Breakdown?.total ?? 0, score_model_version: isChoiceOnlyEvent3(eventFormat) ? null : phase2Breakdown?.scoreModelVersion ?? null, breakdown: isChoiceOnlyEvent3(eventFormat) ? null : phase2Breakdown },
          phase3: { partner_number: matchRow.phase3_partner, partner_first_name: pMap[matchRow.phase3_partner] || "—", compatibility_score: isChoiceOnlyEvent3(eventFormat) ? null : matchRow.phase3_score ?? phase3Breakdown?.total ?? 0, score_model_version: isChoiceOnlyEvent3(eventFormat) ? null : phase3Breakdown?.scoreModelVersion ?? null, word: matchRow.phase3_word || null, breakdown: isChoiceOnlyEvent3(eventFormat) ? null : phase3Breakdown },
          phase4: isChoiceOnlyEvent3(eventFormat) ? { partner_number: matchRow.phase4_partner, partner_first_name: pMap[matchRow.phase4_partner] || "—", compatibility_score: null, score_model_version: null, word: matchRow.phase4_word || null, breakdown: null } : null,
          same_match: matchRow.phase2_partner && matchRow.phase2_partner === matchRow.phase3_partner,
          event_format: eventFormat,
          match_preference: matchRow.match_preference || null,
          current_event_id: eventStateRow?.current_event_id || 1
        })
      }

      // e3-get-notes
      if (action === "e3-get-notes") {
        const { data } = await supabase
          .from("event3_participant_notes")
          .select("about_number,note")
          .eq("match_id", E3_MATCH_ID)
          .eq("event_id", currentEventId)
          .eq("participant_number", myNumber)
          .is("phase", null)
        const noteMap = {}
        for (const r of data || []) noteMap[r.about_number] = r.note
        return res.status(200).json({ notes: noteMap })
      }

      // e3-save-note
      if (action === "e3-save-note") {
        const { about_number, note } = req.body
        const aboutNumber = Number(about_number)
        if (!Number.isInteger(aboutNumber) || aboutNumber <= 0 || aboutNumber === 9999) return res.status(400).json({ error: "about_number required" })
        const trimmed = (note || "").trim()
        if (trimmed.length > 2000) return res.status(400).json({ error: "note is too long" })
        const { error } = await supabase.rpc("save_event3_participant_note_v2", {
          p_event_id: Number(currentEventId),
          p_participant_number: myNumber,
          p_about_number: aboutNumber,
          p_note: trimmed,
          p_expected_test_mode: requestTestMode,
          p_expected_started_at: requestTestMode ? (expectedEvent3SessionKey || null) : null,
        })
        if (error) return res.status(error.code === "22023" ? 400 : ["55000", "P0002"].includes(error.code) ? 409 : 503).json({ error: error.message })
        return res.status(200).json({ ok: true })
      }

      // e3-get-my-group: returns the participant's current-round group for groups.tsx
      if (action === "e3-get-my-group") {
        if (!participant) return res.status(401).json({ error: "Invalid token" })
        // Check enrolled in event3
        const { data: ep } = await supabase.from("event3_participants").select("participant_number").eq("match_id", E3_MATCH_ID).eq("event_id", currentEventId).eq("participant_number", myNumber).maybeSingle()
        if (!ep) return res.status(200).json({ group: null })
        // Determine current round from event phase
        const { data: stateRow } = await supabase.from("event_state").select("phase").eq("match_id", E3_MATCH_ID).maybeSingle()
        const phase = stateRow?.phase || "round1"
        const roundMatch = phase.match(/^round(\d)$/)
        const currentRound = roundMatch ? parseInt(roundMatch[1]) : 1
        // Get their table assignment for this round
        const { data: assignment } = await supabase.from("session_assignments").select("table_number").eq("match_id", E3_MATCH_ID).eq("event_id", currentEventId).eq("round", currentRound).eq("participant_id", myNumber).maybeSingle()
        if (!assignment) return res.status(200).json({ group: null })
        // Get all tablemates
        const { data: tablemates } = await supabase.from("session_assignments").select("participant_id").eq("match_id", E3_MATCH_ID).eq("event_id", currentEventId).eq("round", currentRound).eq("table_number", assignment.table_number)
        const nums = (tablemates || []).map(r => r.participant_id)
        const { data: pdata } = await supabase.from("participants").select("assigned_number,name,gender,survey_data").eq("match_id", MAIN_MATCH).in("assigned_number", nums)
        const nameMap = {}
        for (const p of pdata || []) {
          const sd = typeof p.survey_data === "string" ? JSON.parse(p.survey_data || "{}") : (p.survey_data || {})
          nameMap[p.assigned_number] = { name: p.name || sd?.answers?.name || sd?.name || `#${p.assigned_number}`, gender: p.gender || sd?.answers?.gender || sd?.gender || null }
        }
        const members = nums.map(n => ({ number: n, ...(nameMap[n] || { name: `#${n}`, gender: null }) }))
        return res.status(200).json({ group: { table_number: assignment.table_number, members } })
      }

      // e3-sos — participant requests organizer to come to their table or sends a chat message
      if (action === "e3-sos") {
        if (!participant) return res.status(401).json({ error: "Invalid token" })
        const { message, request_type } = req.body
        const sd = typeof participant.survey_data === "string" ? JSON.parse(participant.survey_data || "{}") : (participant.survey_data || {})
        const fullName = participant.name || sd?.answers?.name || sd?.name || ""
        const pName = firstName(fullName)
        const { data: stateRow } = await supabase.from("event_state").select("phase").eq("match_id", E3_MATCH_ID).maybeSingle()
        const phase = stateRow?.phase || "setup"
        let tableInfo = phase
        const roundMatch = phase.match(/^round(\d)$/)
        if (roundMatch) {
          const { data: sa } = await supabase.from("session_assignments").select("table_number").eq("match_id", E3_MATCH_ID).eq("event_id", currentEventId).eq("round", parseInt(roundMatch[1])).eq("participant_id", myNumber).maybeSingle()
          if (sa) tableInfo = `الجولة ${roundMatch[1]} · طاولة ${sa.table_number}`
        } else if (phase === "phase2_reveal" || phase === "phase3_reveal" || phase === "phase4_reveal") {
          const round = phase === "phase2_reveal" ? 20 : phase === "phase3_reveal" ? 30 : 40
          const { data: seat, error: seatError } = await supabase.from("session_assignments").select("table_number").eq("match_id", E3_MATCH_ID).eq("event_id", currentEventId).eq("round", round).eq("participant_id", myNumber).maybeSingle()
          if (seatError) return res.status(503).json({ error: "تعذّر تحديد الطاولة. حاول مجددًا." })
          tableInfo = (round === 20
            ? (isChoiceOnlyEvent3(eventFormat) ? "لقاء الاختيار الأول" : "لقاء الاختيار")
            : round === 30
              ? (isChoiceOnlyEvent3(eventFormat) ? "لقاء الاختيار الثاني" : "لقاء الخوارزمية")
              : "لقاء الاختيار الثالث")
            + (seat ? ` · طاولة ${seat.table_number}` : " · لم تُحدد الطاولة")
        }

        const { data: savedRequest, error: supportError } = await supabase.rpc("send_event3_support_message_v2", {
          p_event_id: Number(currentEventId), p_participant_number: myNumber,
          p_participant_token: token, p_participant_name: pName, p_table_info: tableInfo,
          p_message: String(message || "").trim().slice(0, 2000), p_request_type: request_type || "chat",
          p_actor: "user",
          p_expected_test_mode: requestTestMode,
          p_expected_started_at: requestTestMode ? (expectedEvent3SessionKey || null) : null,
        })
        if (supportError) return res.status(supportError.code === "55000" ? 409 : 503).json({
          error: supportError.code === "55000"
            ? "تغيّرت جلسة الفعالية. حدّث الصفحة قبل إرسال الطلب."
            : "تعذّر إرسال طلب المساعدة. حاول مجددًا.",
          code: supportError.code === "55000" ? "EVENT3_SESSION_CHANGED" : supportError.code,
        })
        return res.status(200).json(savedRequest)
      }

      // e3-sos-check — poll all SOS requests for this user (chat history)
      if (action === "e3-sos-check") {
        if (!participant) return res.status(401).json({ error: "Invalid token" })
        const { data: requests, error } = await supabase.from("organizer_requests").select("id,status,message,organizer_reply,created_at,chat_history,request_type,table_info").eq("participant_token", token).eq("event_id", currentEventId).order("created_at", { ascending: true })
        if (error) {
          logError("Event3 support history lookup", error)
          return res.status(503).json({ error: "تعذّر تحديث محادثة المساعدة مؤقتاً.", code: "EVENT3_SUPPORT_UNAVAILABLE", retryable: true })
        }
        return res.status(200).json({ requests: requests || [] })
      }

      // e3-get-mood-check — poll for pending mood check
      if (action === "e3-get-mood-check") {
        if (!participant) return res.status(401).json({ error: "Invalid token" })
        const { data: pending, error } = await supabase.from("event3_mood_checks")
          .select("check_id,triggered_at")
          .eq("match_id", E3_MATCH_ID)
          .eq("event_id", currentEventId)
          .eq("participant_number", myNumber)
          .is("mood", null)
          .order("triggered_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        if (error) {
          logError("Event3 mood check lookup", error)
          return res.status(503).json({ error: "تعذّر تحديث سؤال الاطمئنان مؤقتاً.", code: "EVENT3_MOOD_UNAVAILABLE", retryable: true })
        }
        if (!pending) return res.status(200).json({ pending: false })
        return res.status(200).json({ pending: true, check_id: pending.check_id, triggered_at: pending.triggered_at })
      }

      // e3-submit-mood-check
      if (action === "e3-submit-mood-check") {
        if (!participant) return res.status(401).json({ error: "Invalid token" })
        const { check_id, mood } = req.body
        if (!check_id) return res.status(400).json({ error: "check_id required" })
        if (!["happy", "neutral", "not_great", "expired"].includes(mood)) return res.status(400).json({ error: "Invalid mood" })
        const { error } = await supabase.rpc("submit_event3_mood_check_v2", {
          p_event_id: Number(currentEventId),
          p_participant_number: myNumber,
          p_check_id: String(check_id),
          p_mood: mood,
          p_expected_test_mode: requestTestMode,
          p_expected_started_at: requestTestMode ? (expectedEvent3SessionKey || null) : null,
        })
        if (error) return res.status(error.code === "22023" ? 400 : ["55000", "P0002"].includes(error.code) ? 409 : 503).json({ error: error.message })
        return res.status(200).json({ message: "Mood submitted" })
      }

      // e3-get-notification — poll for unseen notification
      if (action === "e3-get-notification") {
        if (!participant) return res.status(401).json({ error: "Invalid token" })
        const { data: pending, error } = await supabase.from("event3_notifications")
          .select("notif_id,title,body,icon,created_at")
          .eq("match_id", E3_MATCH_ID)
          .eq("event_id", currentEventId)
          .eq("participant_number", myNumber)
          .is("seen_at", null)
          .order("icon", { ascending: true })
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle()
        if (error) {
          logError("Event3 notification lookup", error)
          return res.status(503).json({ error: "تعذّر تحديث تنبيه المنظم مؤقتاً.", code: "EVENT3_NOTIFICATION_UNAVAILABLE", retryable: true })
        }
        if (!pending) return res.status(200).json({ pending: false })
        return res.status(200).json({ pending: true, notif_id: pending.notif_id, title: pending.title, body: pending.body, icon: pending.icon, created_at: pending.created_at })
      }

      // e3-dismiss-notification — mark as seen
      if (action === "e3-dismiss-notification") {
        if (!participant) return res.status(401).json({ error: "Invalid token" })
        const { notif_id } = req.body
        if (!notif_id) return res.status(400).json({ error: "notif_id required" })
        const { error } = await supabase.rpc("dismiss_event3_notification_v2", {
          p_event_id: Number(currentEventId),
          p_participant_number: myNumber,
          p_notif_id: String(notif_id),
          p_expected_test_mode: requestTestMode,
          p_expected_started_at: requestTestMode ? (expectedEvent3SessionKey || null) : null,
        })
        if (error) return res.status(error.code === "22023" ? 400 : ["55000", "P0002"].includes(error.code) ? 409 : 503).json({ error: error.message })
        return res.status(200).json({ message: "Notification seen" })
      }

      // e3-ai-welcome — generate personalized welcome message
      if (action === "e3-ai-welcome") {
        if (!token) return res.status(401).json({ error: "Invalid token" })

        // Fetch fresh participant data (bypass cache so DB changes reflect immediately)
        const { data: freshParticipant, error: freshErr } = await supabase
          .from("participants")
          .select("assigned_number,name,gender,age,survey_data")
          .eq("secure_token", token)
          .eq("match_id", MAIN_MATCH)
          .single()
        if (freshErr || !freshParticipant) return res.status(401).json({ error: "Invalid token" })

        const sd = typeof freshParticipant.survey_data === "string" ? JSON.parse(freshParticipant.survey_data || "{}") : (freshParticipant.survey_data || {})

        // Test walkthroughs never read or mutate the live personalized welcome.
        if (activeTestMode) {
          return res.status(200).json({ success: false, message: null })
        }

        // Check for cached welcome in dedicated table
        const { data: cachedRow } = await supabase.from("event3_ai_welcome_messages")
          .select("welcome_message")
          .eq("match_id", E3_MATCH_ID)
          .eq("event_id", currentEventId)
          .eq("participant_number", myNumber)
          .maybeSingle()
        if (cachedRow?.welcome_message) {
          return res.status(200).json({ success: true, message: cachedRow.welcome_message, cached: true })
        }

        const fullName = freshParticipant.name || sd?.answers?.name || sd?.name || ""
        const firstName = fullName.trim().split(/\s+/)[0] || "صديقنا"
        const gender = freshParticipant.gender || sd?.answers?.gender || sd?.gender || ""
        const age = freshParticipant.age || sd?.answers?.age || sd?.age || ""

        // Returning participant detection: fetch prior welcome messages from other events
        const { data: priorWelcomes } = await supabase.from("event3_ai_welcome_messages")
          .select("welcome_message,anchor_used,event_id")
          .eq("match_id", E3_MATCH_ID)
          .eq("participant_number", myNumber)
          .neq("event_id", currentEventId)
        const priorMessages = (priorWelcomes || []).map(w => w.welcome_message).filter(Boolean)
        const priorAnchors = [...new Set((priorWelcomes || []).flatMap(w => (w.anchor_used || "").split(",").filter(Boolean)))]

        // Build prompt using shared builder
        const { prompt, anchorsUsed } = buildWelcomePrompt({
          participantNum: myNumber,
          firstName,
          gender,
          age,
          surveyData: sd,
          priorAnchors,
          priorMessages,
        })

        try {
          const completion = await openai.chat.completions.create({
            model: "gpt-5.4-mini",
            messages: [{ role: "user", content: prompt }],
            max_completion_tokens: 400,
            temperature: 0.95,
            presence_penalty: 0.8,
            frequency_penalty: 0.5,
          })

          const message = completion.choices[0]?.message?.content?.trim()
          if (!message) throw new Error("AI generated empty welcome")

          // Persist only if this request still belongs to the same Event3 session.
          const { error: welcomeSaveError } = await supabase.rpc("upsert_event3_welcome_messages_v2", {
            p_event_id: Number(currentEventId),
            p_rows: [{
              participant_number: myNumber,
              welcome_message: message,
              generated_by: 'system',
              anchor_used: anchorsUsed.join(","),
            }],
            p_expected_test_mode: requestTestMode,
            p_expected_started_at: requestTestMode ? (expectedEvent3SessionKey || null) : null,
          })
          if (welcomeSaveError) throw welcomeSaveError

          return res.status(200).json({ success: true, message, cached: false })
        } catch (aiErr) {
          console.error("e3-ai-welcome AI error:", aiErr)
          if (["55000", "P0002"].includes(aiErr?.code)) {
            return res.status(409).json({ error: "تغيّرت جلسة الفعالية. حدّث الصفحة قبل المتابعة.", code: "EVENT3_SESSION_CHANGED", retryable: true })
          }
          return res.status(200).json({ success: false, message: null })
        }
      }

      // e3-get-pending-feedbacks — check for unsubmitted one-to-one feedbacks
      // Uses event3_participants to find which events the user attended, then checks event3_matches
      if (action === "e3-get-pending-feedbacks") {
        if (!participant) return res.status(401).json({ error: "Invalid token" })
        console.log(`[pending-feedbacks] Checking for participant #${myNumber}`)
        // 1. Find all events this user participated in from event3_participants
        const { data: epRows, error: epErr } = await supabase.from("event3_participants")
          .select("event_id")
          .eq("match_id", E3_MATCH_ID)
          .eq("participant_number", myNumber)
        if (epErr) console.error("[pending-feedbacks] event3_participants error:", epErr.message)
        const eventIds = (epRows || []).map(r => r.event_id)
        console.log(`[pending-feedbacks] Participant #${myNumber} attended events:`, eventIds)
        if (eventIds.length === 0) return res.status(200).json({ pending: [] })
        // 2. Query event3_matches for all those events
        let matchesLookup = await supabase.from("event3_matches")
          .select("event_id,phase2_partner,phase3_partner,phase4_partner,phase2_feedback,phase3_feedback,phase4_feedback")
          .eq("match_id", E3_MATCH_ID)
          .eq("participant_number", myNumber)
          .in("event_id", eventIds)
        if (matchesLookup.error && ["42703", "PGRST204"].includes(matchesLookup.error.code)) {
          matchesLookup = await supabase.from("event3_matches")
            .select("event_id,phase2_partner,phase3_partner,phase2_feedback,phase3_feedback")
            .eq("match_id", E3_MATCH_ID)
            .eq("participant_number", myNumber)
            .in("event_id", eventIds)
        }
        const { data: allMatches, error: mErr } = matchesLookup
        if (mErr) return res.status(503).json({ error: mErr.message, retryable: true })
        console.log(`[pending-feedbacks] Found ${allMatches?.length || 0} match rows for participant #${myNumber}`)
        const pending = []
        const formatEntries = await Promise.all([...new Set((allMatches || []).map(match => Number(match.event_id)))].map(async eventId => [
          eventId,
          await loadEvent3Format(supabase, E3_MATCH_ID, eventId),
        ]))
        const pendingFormatByEvent = new Map(formatEntries)
        for (const m of allMatches || []) {
          const isCurrentEdition = Number(m.event_id) === Number(currentEventId)
          const firstMatchIsVisible = !isCurrentEdition || EVENT3_FIRST_MATCH_REVEAL_PHASES.has(activeEvent3Phase)
          const secondMatchIsVisible = !isCurrentEdition || EVENT3_SECOND_MATCH_REVEAL_PHASES.has(activeEvent3Phase)
          const thirdMatchIsVisible = !isCurrentEdition || EVENT3_THIRD_MATCH_REVEAL_PHASES.has(activeEvent3Phase)
          if (firstMatchIsVisible && m.phase2_partner && !m.phase2_feedback) {
            pending.push({ event_id: m.event_id, event_format: pendingFormatByEvent.get(Number(m.event_id)) || "classic", phase: "phase2", partner_number: m.phase2_partner })
          }
          if (secondMatchIsVisible && m.phase3_partner && !m.phase3_feedback) {
            pending.push({ event_id: m.event_id, event_format: pendingFormatByEvent.get(Number(m.event_id)) || "classic", phase: "phase3", partner_number: m.phase3_partner })
          }
          if (thirdMatchIsVisible && pendingFormatByEvent.get(Number(m.event_id)) === "choice_only_three_groups" && m.phase4_partner && !m.phase4_feedback) {
            pending.push({ event_id: m.event_id, event_format: "choice_only_three_groups", phase: "phase4", partner_number: m.phase4_partner })
          }
        }
        console.log(`[pending-feedbacks] Found ${pending.length} pending feedbacks for participant #${myNumber}`)
        if (pending.length === 0) return res.status(200).json({ pending: [] })
        // 3. Fetch partner names
        const partnerNums = [...new Set(pending.map(p => p.partner_number))]
        const { data: pRows } = await supabase.from("participants")
          .select("assigned_number,name,survey_data")
          .eq("match_id", MAIN_MATCH)
          .in("assigned_number", partnerNums)
        const nameMap = {}
        for (const p of pRows || []) {
          const sd = typeof p.survey_data === "string" ? JSON.parse(p.survey_data || "{}") : (p.survey_data || {})
          nameMap[p.assigned_number] = p.name || sd?.answers?.name || sd?.name || `#${p.assigned_number}`
        }
        const result = pending.map(p => ({
          event_id: p.event_id,
          event_format: p.event_format,
          phase: p.phase,
          partner_number: p.partner_number,
          partner_name: firstName(nameMap[p.partner_number] || `#${p.partner_number}`),
        }))
        return res.status(200).json({ pending: result })
      }

      // e3-submit-feedback-remote — submit missing feedback from welcome page
      if (action === "e3-submit-feedback-remote") {
        if (!participant) return res.status(401).json({ error: "Invalid token" })
        const { event_id, phase, feedback } = req.body
        if (!event_id || !phase || !feedback) return res.status(400).json({ error: "event_id, phase, and feedback required" })
        if (!["phase2", "phase3", "phase4"].includes(phase)) return res.status(400).json({ error: "Invalid feedback phase" })
        const normalizedFeedback = normalizeEvent3FeedbackPayload(feedback)
        if (normalizedFeedback.error) return res.status(400).json({ error: normalizedFeedback.error })
        const safeFeedback = normalizedFeedback.value
        const historicalFormat = await loadEvent3Format(supabase, E3_MATCH_ID, Number(event_id))
        if (phase === "phase4" && !isChoiceOnlyEvent3(historicalFormat)) return res.status(400).json({ error: "This edition has no third choice match" })
        const col = phase === "phase2" ? "phase2_feedback" : phase === "phase3" ? "phase3_feedback" : "phase4_feedback"
        const partnerCol = phase === "phase2" ? "phase2_partner" : phase === "phase3" ? "phase3_partner" : "phase4_partner"
        const slot = phase === "phase2" ? 1 : phase === "phase3" ? 2 : 3
        console.log(`[submit-feedback-remote] Updating #${myNumber} event ${event_id} ${phase}`)

        // Bind a late feedback write to the exact reciprocal pair that the
        // participant met. For the active edition, reuse the session-aware RPC;
        // completed historical editions are immutable and can use a guarded
        // first-write update after the reciprocal check.
        const { data: historicalMatch, error: historicalMatchError } = await supabase.from("event3_matches")
          .select(`${partnerCol},${col}`)
          .eq("match_id", E3_MATCH_ID)
          .eq("event_id", event_id)
          .eq("participant_number", myNumber)
          .maybeSingle()
        if (historicalMatchError) {
          const migrationRequired = phase === "phase4" && ["42703", "PGRST204"].includes(historicalMatchError.code)
          return res.status(migrationRequired ? 501 : 500).json({ error: historicalMatchError.message, migration_required: migrationRequired })
        }
        const expectedPartner = historicalMatch?.[partnerCol]
        if (!expectedPartner) return res.status(404).json({ error: "لم يتم العثور على شريك هذا اللقاء." })
        if (historicalMatch?.[col]) return res.status(200).json({ message: "Feedback already submitted", already_saved: true })
        const { data: reciprocalMatch, error: reciprocalError } = await supabase.from("event3_matches")
          .select(partnerCol)
          .eq("match_id", E3_MATCH_ID)
          .eq("event_id", event_id)
          .eq("participant_number", expectedPartner)
          .maybeSingle()
        if (reciprocalError) return res.status(500).json({ error: reciprocalError.message })
        if (reciprocalMatch?.[partnerCol] !== myNumber) {
          return res.status(409).json({ error: "تغيّر شريك اللقاء قبل حفظ التقييم. حدّث الصفحة وحاول مجددًا." })
        }
        if (Number(event_id) === Number(currentEventId)) {
          const saved = await saveEvent3MatchInteraction({ slot, partner: expectedPartner, operation: "feedback", payload: safeFeedback })
          if (saved.response) return saved.response
          if (!saved.fallback) {
            return res.status(200).json({ message: saved.data?.already_saved ? "Feedback already submitted" : "Feedback saved", already_saved: !!saved.data?.already_saved })
          }
          if (phase === "phase4") return res.status(501).json({ error: "The third choice migration is required", migration_required: true })
        }
        const { data: updatedRows, error } = await supabase.from("event3_matches")
          .update({ [col]: safeFeedback })
          .eq("match_id", E3_MATCH_ID)
          .eq("event_id", event_id)
          .eq("participant_number", myNumber)
          .eq(partnerCol, expectedPartner)
          .is(col, null)
          .select("id")
        if (error) {
          console.error(`[submit-feedback-remote] DB error:`, error.message)
          const migrationRequired = phase === "phase4" && ["42703", "PGRST204"].includes(error.code)
          return res.status(migrationRequired ? 501 : 500).json({ error: error.message, migration_required: migrationRequired })
        }
        if (!updatedRows || updatedRows.length === 0) {
          const { data: existing } = await supabase.from("event3_matches").select(col)
            .eq("match_id", E3_MATCH_ID).eq("event_id", event_id)
            .eq("participant_number", myNumber).maybeSingle()
          if (existing?.[col]) return res.status(200).json({ message: "Feedback already submitted", already_saved: true })
          console.error(`[submit-feedback-remote] No matching row found for #${myNumber} event ${event_id} ${phase}`)
          return res.status(404).json({ error: "لم يتم العثور على بيانات المطابقة. تأكد من أنك مشارك في هذه الفعالية." })
        }
        console.log(`[submit-feedback-remote] Success: ${updatedRows.length} row(s) updated for #${myNumber}`)
        return res.status(200).json({ message: "Feedback saved" })
      }

      return res.status(400).json({ error: `Unknown e3 action: ${action}` })
    } catch (e3err) {
      console.error("e3 participant error:", e3err)
      return res.status(500).json({ error: e3err.message || "Internal server error" })
    }
  }

  // ── Forgot token / OTP recovery via Twilio Verify API ────────────────────
  if (action === "request-otp") {
    if (!enforceRateLimit(req, res, { key: "request-otp", limit: 5, windowMs: 15 * 60_000 })) return
    try {
      const { phone_number } = req.body
      if (!phone_number) return res.status(400).json({ error: "رقم الجوال مطلوب" })

      if (!isPlausibleParticipantPhone(phone_number)) {
        return res.status(400).json({ error: "رقم الجوال غير صحيح" })
      }

      const { participants, error: lookupError } = await findParticipantsByExactPhone(phone_number)
      if (lookupError) {
        console.error("request-otp phone lookup error:", lookupError)
        return res.status(500).json({ error: "خطأ في البحث عن الحساب" })
      }
      if (participants.length === 0) {
        return res.status(400).json({ error: "لم يتم العثور على مشارك بهذا الرقم" })
      }
      if (participants.length > 1) {
        return res.status(409).json({
          code: "PHONE_ACCOUNT_AMBIGUOUS",
          error: "يوجد أكثر من حساب قديم مرتبط بهذا الرقم. يرجى التواصل مع المنظم.",
        })
      }
      const participant = participants[0]

      const accountSid = process.env.TWILIO_ACCOUNT_SID
      const authToken = process.env.TWILIO_AUTH_TOKEN
      const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID
      if (!accountSid || !authToken || !verifyServiceSid) {
        console.error("Twilio Verify not configured")
        return res.status(500).json({ error: "إعدادات Twilio Verify غير مكتملة" })
      }

      // Normalize phone to E.164 format (Twilio Verify requires it)
      const to = participantPhoneToE164(participant.phone_number)

      // Call Twilio Verify API to send OTP via WhatsApp
      const verifyUrl = `https://verify.twilio.com/v2/Services/${verifyServiceSid}/Verifications`
      const body = new URLSearchParams()
      body.append("To", to)
      body.append("Channel", "sms")

      const verifyRes = await fetch(verifyUrl, {
        method: "POST",
        headers: {
          "Authorization": "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      })

      const verifyData = await verifyRes.json()
      if (!verifyRes.ok) {
        console.error("Twilio Verify send error:", verifyData)
        return res.status(500).json({ error: "فشل في إرسال رمز التحقق" })
      }

      return res.status(200).json({ success: true, message: "تم إرسال رمز التحقق عبر الرسائل القصيرة" })
    } catch (err) {
      console.error("request-otp error:", err)
      return res.status(500).json({ error: "خطأ في الطلب" })
    }
  }

  if (action === "verify-otp") {
    if (!enforceRateLimit(req, res, { key: "verify-otp", limit: 10, windowMs: 15 * 60_000 })) return
    try {
      const { phone_number, otp, provisional_secure_token } = req.body
      if (!phone_number || !otp) return res.status(400).json({ error: "رقم الجوال والرمز مطلوبان" })

      if (!isPlausibleParticipantPhone(phone_number)) {
        return res.status(400).json({ error: "رقم غير صحيح" })
      }

      const { participants, error: lookupError } = await findParticipantsByExactPhone(phone_number)
      if (lookupError) return res.status(500).json({ error: "خطأ في البحث عن الحساب" })
      if (participants.length === 0) return res.status(400).json({ error: "رقم غير صحيح" })
      if (participants.length > 1) {
        return res.status(409).json({
          code: "PHONE_ACCOUNT_AMBIGUOUS",
          error: "يوجد أكثر من حساب قديم مرتبط بهذا الرقم. يرجى التواصل مع المنظم.",
        })
      }
      const participant = participants[0]

      const accountSid = process.env.TWILIO_ACCOUNT_SID
      const authToken = process.env.TWILIO_AUTH_TOKEN
      const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID
      if (!accountSid || !authToken || !verifyServiceSid) {
        return res.status(500).json({ error: "إعدادات Twilio Verify غير مكتملة" })
      }

      // Normalize phone to E.164
      const to = participantPhoneToE164(participant.phone_number)

      // Call Twilio Verify API to check the OTP
      const checkUrl = `https://verify.twilio.com/v2/Services/${verifyServiceSid}/VerificationCheck`
      const body = new URLSearchParams()
      body.append("To", to)
      body.append("Code", String(otp).trim())

      const checkRes = await fetch(checkUrl, {
        method: "POST",
        headers: {
          "Authorization": "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      })

      const checkData = await checkRes.json()
      if (!checkRes.ok || checkData.status !== "approved") {
        return res.status(400).json({ error: "رمز التحقق غير صحيح أو منتهي الصلاحية" })
      }

      const provisional_discarded = await discardUnusedProvisionalParticipant(
        provisional_secure_token,
        participant.id
      )

      return res.status(200).json({
        success: true,
        secure_token: participant.secure_token,
        assigned_number: participant.assigned_number,
        name: participant.name,
        provisional_discarded,
      })
    } catch (err) {
      console.error("verify-otp error:", err)
      return res.status(500).json({ error: "خطأ في التحقق" })
    }
  }

  // PDPL data-subject rights: authenticated with the participant's rotated secret token.
  if (action === "export-my-data" || action === "request-data-deletion" || action === "withdraw-consent") {
    const secureToken = String(req.body?.secure_token || "")
    if (!secureToken) return res.status(401).json({ error: "A participant token is required" })
    if (!enforceRateLimit(req, res, { key: `privacy-${action}`, limit: 5, windowMs: 60 * 60_000 })) return

    const { data: participant, error: participantError } = await supabase
      .from("participants")
      .select("*")
      .eq("secure_token", secureToken)
      .eq("match_id", "00000000-0000-0000-0000-000000000000")
      .single()
    if (participantError || !participant) return res.status(401).json({ error: "Invalid participant token" })

    if (action === "export-my-data") {
      const number = participant.assigned_number
      const [matches, feedback, attendance, rankings, requests, receipts] = await Promise.all([
        supabase.from("match_results").select("event_id,round,match_type,participant_a_number,participant_b_number,participant_c_number,participant_d_number,compatibility_score,created_at").or(`participant_a_number.eq.${number},participant_b_number.eq.${number},participant_c_number.eq.${number},participant_d_number.eq.${number}`),
        supabase.from("match_feedback").select("event_id,round,submitted_at,compatibility_rate,conversation_quality,personal_connection,shared_interests,comfort_level,communication_style,overall_experience,recommendations,would_meet_again,participant_message").eq("participant_number", number),
        supabase.from("event_attendance").select("event_id,attended,updated_at").eq("participant_number", number),
        supabase.from("participant_rankings").select("event_id,ranked_number,rank,submitted_at").eq("ranker_number", number),
        supabase.from("organizer_requests").select("event_id,message,status,organizer_reply,created_at,request_type,chat_history").eq("participant_number", number),
        supabase.from("participant_receipts").select("event_id,status,received_at,reviewed_at,rejection_reason").eq("assigned_number", number),
      ])
      const { secure_token: _secret, ...profile } = participant
      res.setHeader("Cache-Control", "no-store")
      return res.status(200).json({
        exported_at: new Date().toISOString(),
        profile,
        matches: matches.data || [], feedback: feedback.data || [], attendance: attendance.data || [],
        rankings: rankings.data || [], organizer_requests: requests.data || [], receipts: receipts.data || [],
      })
    }

    const requestType = action === "withdraw-consent" ? "withdraw_consent_and_destroy" : "destroy"
    const { data: existingRequest } = await supabase.from("data_subject_requests")
      .select("id,status").eq("participant_id", participant.id).eq("request_type", requestType)
      .in("status", ["received", "verifying", "in_progress"]).maybeSingle()
    if (!existingRequest) {
      await supabase.from("data_subject_requests").insert({
        participant_id: participant.id,
        assigned_number: participant.assigned_number,
        request_type: requestType,
        status: "received",
        identity_verified_at: new Date().toISOString(),
        due_at: new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString(),
      })
    }
    if (action === "withdraw-consent") {
      await supabase.from("participants").update({
        consent_withdrawn_at: new Date().toISOString(), marketing_consent: false,
        auto_signup_next_event: false, signup_for_next_event: false,
      }).eq("id", participant.id)
    }
    return res.status(202).json({
      success: true,
      request_id: existingRequest?.id || null,
      message: "Your verified privacy request has been recorded for completion and confirmation.",
    })
  }

  return res.status(400).json({ error: 'Invalid action' })
}
