import test from "node:test"
import assert from "node:assert/strict"
import {
  LEGAL_DOCUMENT_VERSION,
  buildLegalAcceptanceRow,
  hasCurrentLegalAcceptance,
  shouldRequireLegalAcceptance,
} from "./legal-acceptance.mjs"

const participant = {
  id: "00000000-0000-0000-0000-000000000078",
  assigned_number: 78,
  survey_data: { answers: { name: "Participant" } },
  terms_version: "2026-08-06",
  privacy_notice_version: "2026-08-06",
  consented_at: "2026-08-06T00:00:00.000Z",
}

test("prior participant requires the updated legal bundle", () => {
  assert.equal(shouldRequireLegalAcceptance(participant, null), true)
})

test("current participant columns or ledger row satisfy the gate", () => {
  assert.equal(hasCurrentLegalAcceptance({
    ...participant,
    terms_version: LEGAL_DOCUMENT_VERSION,
    privacy_notice_version: LEGAL_DOCUMENT_VERSION,
    consented_at: "2026-09-01T00:00:00.000Z",
  }, null), true)
  assert.equal(shouldRequireLegalAcceptance(participant, {
    document_bundle_version: LEGAL_DOCUMENT_VERSION,
    terms_version: LEGAL_DOCUMENT_VERSION,
    privacy_notice_version: LEGAL_DOCUMENT_VERSION,
  }), false)
})

test("provisional profiles are not interrupted before registration", () => {
  assert.equal(shouldRequireLegalAcceptance({ ...participant, survey_data: null }, null), false)
})

test("acceptance rows contain no participant token", () => {
  const row = buildLegalAcceptanceRow(participant, { eventId: 26, acceptedAt: "2026-09-01T00:00:00.000Z" })
  assert.equal(row.document_bundle_version, LEGAL_DOCUMENT_VERSION)
  assert.equal(row.event_id, 26)
  assert.equal("secure_token" in row, false)
})
