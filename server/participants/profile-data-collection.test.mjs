import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PROFILE_DATA_COLLECTION_IDS,
  validateProfileDataCollection,
} from './profile-data-collection.mjs'

test('accepts and normalizes every profile data collection answer', () => {
  const result = validateProfileDataCollection({
    expression_language: 5,
    minimum_partner_religious_commitment: ' 2 ',
    social_relationship_style: '4',
  }, { requireAll: true })

  assert.equal(result.valid, true)
  assert.deepEqual(result.answers, {
    expression_language: '5',
    minimum_partner_religious_commitment: '2',
    social_relationship_style: '4',
  })
})

test('rejects values outside each question range', () => {
  const result = validateProfileDataCollection({
    expression_language: '6',
    minimum_partner_religious_commitment: '5',
    social_relationship_style: '0',
  })

  assert.equal(result.valid, false)
  assert.deepEqual(Object.keys(result.errors).sort(), [...PROFILE_DATA_COLLECTION_IDS].sort())
  assert.deepEqual(result.answers, {})
})

test('allows legacy submissions to omit the new answers', () => {
  const optional = validateProfileDataCollection({}, { requireAll: false })
  const required = validateProfileDataCollection({}, { requireAll: true })

  assert.equal(optional.valid, true)
  assert.deepEqual(optional.answers, {})
  assert.equal(required.valid, false)
  assert.deepEqual(Object.keys(required.errors).sort(), [...PROFILE_DATA_COLLECTION_IDS].sort())
})
