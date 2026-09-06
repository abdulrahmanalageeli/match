import { getCache } from "@vercel/functions"

const CACHE_SCHEMA_VERSION = "event3-choice-seating-candidates-v2"
const CHECKPOINT_SCHEMA_VERSION = "event3-choice-seating-checkpoint-v2"
const CACHE_TTL_SECONDS = 6 * 60 * 60
const CACHE_TTL_MS = CACHE_TTL_SECONDS * 1000
const CACHE_NAMESPACE = "event3-choice-seating"

const memoryCache = new Map()
const inFlightGenerations = new Map()
let runtimeCacheClient
let runtimeCacheUnavailableLogged = false

function cacheKey(contextHash) {
  return `${CACHE_SCHEMA_VERSION}:${String(contextHash)}`
}

function checkpointKey(contextHash) {
  return `${CHECKPOINT_SCHEMA_VERSION}:${String(contextHash)}`
}

function validGeneratedCandidates(generated) {
  return Boolean(generated)
    && typeof generated === "object"
    && typeof generated.objectiveVersion === "string"
    && Array.isArray(generated.candidates)
    && generated.candidates.length === 3
}

function validEnvelope(envelope, contextHash, now = Date.now()) {
  return Boolean(envelope)
    && envelope.schema_version === CACHE_SCHEMA_VERSION
    && envelope.context_hash === String(contextHash)
    && Number.isFinite(Number(envelope.created_at))
    && now - Number(envelope.created_at) < CACHE_TTL_MS
    && validGeneratedCandidates(envelope.generated)
}

function validCheckpointEnvelope(envelope, contextHash, now = Date.now()) {
  return Boolean(envelope)
    && envelope.schema_version === CHECKPOINT_SCHEMA_VERSION
    && envelope.context_hash === String(contextHash)
    && Number.isFinite(Number(envelope.created_at))
    && now - Number(envelope.created_at) < CACHE_TTL_MS
    && Boolean(envelope.checkpoint)
    && typeof envelope.checkpoint === "object"
}

function getRuntimeCacheClient() {
  if (!process.env.VERCEL) return null
  if (runtimeCacheClient) return runtimeCacheClient
  try {
    runtimeCacheClient = getCache({ namespace: CACHE_NAMESPACE })
    return runtimeCacheClient
  } catch (error) {
    if (!runtimeCacheUnavailableLogged) {
      runtimeCacheUnavailableLogged = true
      console.warn("[event3-choice-seating-cache] Runtime Cache unavailable; using isolate memory only", error)
    }
    return null
  }
}

async function readEnvelope(key, validator, contextHash) {
  const now = Date.now()
  const memoryEnvelope = memoryCache.get(key)
  if (validator(memoryEnvelope, contextHash, now)) return { envelope: memoryEnvelope, layer: "memory" }
  if (memoryEnvelope) memoryCache.delete(key)

  const runtimeCache = getRuntimeCacheClient()
  if (!runtimeCache) return null
  try {
    const runtimeEnvelope = await runtimeCache.get(key)
    if (!validator(runtimeEnvelope, contextHash, now)) {
      if (runtimeEnvelope) await runtimeCache.delete(key).catch(() => undefined)
      return null
    }
    memoryCache.set(key, runtimeEnvelope)
    return { envelope: runtimeEnvelope, layer: "runtime" }
  } catch (error) {
    console.warn("[event3-choice-seating-cache] Runtime Cache read failed; continuing without it", {
      message: error?.message || String(error),
    })
    return null
  }
}

function readCachedGeneration(contextHash) {
  return readEnvelope(cacheKey(contextHash), validEnvelope, contextHash)
}

function readGenerationCheckpoint(contextHash) {
  return readEnvelope(checkpointKey(contextHash), validCheckpointEnvelope, contextHash)
}

async function storeEnvelope({ key, envelope, eventId, name }) {
  memoryCache.set(key, envelope)
  const runtimeCache = getRuntimeCacheClient()
  if (!runtimeCache) return { stored: true, layer: "memory" }
  try {
    await runtimeCache.set(key, envelope, {
      ttl: CACHE_TTL_SECONDS,
      tags: [CACHE_NAMESPACE, `event3-choice-seating-${Number(eventId)}`],
      name,
    })
    return { stored: true, layer: "runtime" }
  } catch (error) {
    console.warn("[event3-choice-seating-cache] Runtime Cache write failed; isolate memory remains available", {
      message: error?.message || String(error),
    })
    return { stored: true, layer: "memory" }
  }
}

async function deleteGenerationCheckpoint(contextHash) {
  const key = checkpointKey(contextHash)
  memoryCache.delete(key)
  const runtimeCache = getRuntimeCacheClient()
  if (!runtimeCache) return
  await runtimeCache.delete(key).catch(error => {
    console.warn("[event3-choice-seating-cache] Runtime Cache checkpoint cleanup failed", {
      message: error?.message || String(error),
    })
  })
}

async function storeGeneratedCandidates({ contextHash, eventId, generated }) {
  if (!validGeneratedCandidates(generated)) return { stored: false, layer: "none" }
  const envelope = {
    schema_version: CACHE_SCHEMA_VERSION,
    context_hash: String(contextHash),
    created_at: Date.now(),
    generated,
  }
  const stored = await storeEnvelope({
    key: cacheKey(contextHash),
    envelope,
    eventId,
    name: "Event3 choice seating candidates",
  })
  await deleteGenerationCheckpoint(contextHash)
  return stored
}

async function storeGenerationCheckpoint({ contextHash, eventId, checkpoint }) {
  if (!checkpoint || typeof checkpoint !== "object") return { stored: false, layer: "none" }
  const envelope = {
    schema_version: CHECKPOINT_SCHEMA_VERSION,
    context_hash: String(contextHash),
    created_at: Date.now(),
    checkpoint,
  }
  return storeEnvelope({
    key: checkpointKey(contextHash),
    envelope,
    eventId,
    name: "Event3 choice seating generation checkpoint",
  })
}

function responseFromResult(result, requestStartedAt, status) {
  return {
    ...(result.generated ? { generated: result.generated } : {}),
    ...(result.pending ? { pending: true, progress: result.progress } : {}),
    cache: {
      status,
      layer: result.layer,
      age_ms: 0,
      generation_ms: result.generationMs,
      total_ms: Date.now() - requestStartedAt,
      ttl_seconds: CACHE_TTL_SECONDS,
      ...(result.progress || {}),
    },
  }
}

export async function getOrBuildChoiceSeatingCandidates({ contextHash, eventId, build, buildStep }) {
  if (!contextHash || (typeof build !== "function" && typeof buildStep !== "function")) {
    throw new TypeError("A seating context hash and build function are required")
  }
  const requestStartedAt = Date.now()
  const cached = await readCachedGeneration(contextHash)
  if (cached) {
    const ageMs = Math.max(0, Date.now() - Number(cached.envelope.created_at))
    console.info("[event3-choice-seating-cache] hit", { event_id: Number(eventId), layer: cached.layer, age_ms: ageMs })
    return {
      generated: cached.envelope.generated,
      cache: {
        status: "hit",
        layer: cached.layer,
        age_ms: ageMs,
        generation_ms: 0,
        total_ms: Date.now() - requestStartedAt,
        ttl_seconds: CACHE_TTL_SECONDS,
      },
    }
  }

  const key = cacheKey(contextHash)
  const existingGeneration = inFlightGenerations.get(key)
  if (existingGeneration) {
    const result = await existingGeneration
    return responseFromResult(result, requestStartedAt, "coalesced")
  }

  const generation = (async () => {
    const generationStartedAt = Date.now()
    if (typeof buildStep === "function") {
      const saved = await readGenerationCheckpoint(contextHash)
      const stepResult = await buildStep(saved?.envelope?.checkpoint || null)
      const generationMs = Date.now() - generationStartedAt
      if (!stepResult?.complete) {
        if (!stepResult?.checkpoint) throw new Error("The seating generation step did not return a resumable checkpoint")
        const stored = await storeGenerationCheckpoint({ contextHash, eventId, checkpoint: stepResult.checkpoint })
        console.info("[event3-choice-seating-cache] checkpoint", {
          event_id: Number(eventId),
          generation_ms: generationMs,
          cache_layer: stored.layer,
          completed_steps: Number(stepResult.progress?.completed_steps || 0),
          total_steps: Number(stepResult.progress?.total_steps || 0),
        })
        return { pending: true, progress: stepResult.progress || {}, generationMs, layer: stored.layer }
      }
      const stored = await storeGeneratedCandidates({ contextHash, eventId, generated: stepResult.generated })
      console.info("[event3-choice-seating-cache] generated", {
        event_id: Number(eventId),
        generation_ms: generationMs,
        cache_layer: stored.layer,
        cached: stored.stored,
        resumed: Boolean(saved),
      })
      return { generated: stepResult.generated, generationMs, layer: stored.layer }
    }

    const generated = await build()
    const generationMs = Date.now() - generationStartedAt
    const stored = await storeGeneratedCandidates({ contextHash, eventId, generated })
    console.info("[event3-choice-seating-cache] generated", {
      event_id: Number(eventId),
      generation_ms: generationMs,
      cache_layer: stored.layer,
      cached: stored.stored,
    })
    return { generated, generationMs, layer: stored.layer }
  })()
  inFlightGenerations.set(key, generation)

  try {
    const result = await generation
    return responseFromResult(result, requestStartedAt, result.pending ? "checkpoint" : "miss")
  } finally {
    if (inFlightGenerations.get(key) === generation) inFlightGenerations.delete(key)
  }
}

export const choiceSeatingCacheInternals = Object.freeze({
  CACHE_SCHEMA_VERSION,
  CHECKPOINT_SCHEMA_VERSION,
  CACHE_TTL_SECONDS,
  cacheKey,
  checkpointKey,
  validEnvelope,
  validCheckpointEnvelope,
  resetForTests() {
    memoryCache.clear()
    inFlightGenerations.clear()
    runtimeCacheClient = undefined
    runtimeCacheUnavailableLogged = false
  },
})
