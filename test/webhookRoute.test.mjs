import assert from 'node:assert/strict'
import { test } from 'node:test'
import { handleWebhookRequest } from '../server/webhookRoute.ts'

const lead = {
  consented: true,
  tcpa_consent_granted: false,
  consent_timestamp: '',
  fullName: 'Synthetic Lead',
  email: '',
  cellPhone: '',
  textMessagePreference: '',
  dateOfBirth: '',
  gender: '',
  height: '',
  weight: '',
  tobaccoNicotineVaping: '',
  policyType: '',
  coverageAmount: '',
  hasDiabetes: false,
  diabetesType: '',
  diabetesTreatment: '',
  lastA1C: '',
  hasCancer: false,
  cancerType: '',
  cancerFreeDuration: '',
}

function submit(fields = {}) {
  return handleWebhookRequest(new Request('https://app.example.test/api/lead', {
    method: 'POST',
    body: JSON.stringify({ ...lead, ...fields }),
  }))
}

test('rejects missing contact and missing consent before CRM handoff', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch')
  assert.equal((await submit()).status, 400)
  assert.equal((await submit({ cellPhone: '   ' })).status, 400)
  assert.equal((await submit({ email: 'lead@example.test', consented: false })).status, 400)
  assert.equal((await submit({
    email: 'lead@example.test',
    cellPhone: '   ',
    tcpa_consent_granted: true,
    consent_timestamp: new Date().toISOString(),
  })).status, 400)
  assert.equal((await submit({ cellPhone: 'not-a-number' })).status, 400)
  assert.equal((await submit({ email: 'lead@example.test', cellPhone: '123' })).status, 400)
  assert.equal(fetch.mock.callCount(), 0)
})

test('sends an email-only lead with a bounded CRM request', async (t) => {
  const originalUrl = process.env.CRM_WEBHOOK_URL
  const originalSecret = process.env.CRM_WEBHOOK_SECRET
  process.env.CRM_WEBHOOK_URL = 'https://crm.example.test/'
  process.env.CRM_WEBHOOK_SECRET = 'synthetic'
  t.after(() => {
    if (originalUrl === undefined) delete process.env.CRM_WEBHOOK_URL
    else process.env.CRM_WEBHOOK_URL = originalUrl
    if (originalSecret === undefined) delete process.env.CRM_WEBHOOK_SECRET
    else process.env.CRM_WEBHOOK_SECRET = originalSecret
  })
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 204 }))
  assert.equal((await submit({
    email: 'lead@example.test',
    diabetesType: 'Synthetic past answer',
    cancerType: 'Synthetic past answer',
  })).status, 200)
  assert.equal(fetch.mock.callCount(), 1)
  const [, options] = fetch.mock.calls[0].arguments
  assert.ok(options.signal instanceof AbortSignal)
  const outbound = JSON.parse(options.body)
  assert.equal(outbound.email, 'lead@example.test')
  assert.equal(outbound.diabetesType, '')
  assert.equal(outbound.cancerType, '')

  assert.equal((await submit({
    cellPhone: '+1 (512) 555-0100',
    hasDiabetes: true,
    diabetesType: 'Synthetic current answer',
  })).status, 200)
  const phoneLead = JSON.parse(fetch.mock.calls[1].arguments[1].body)
  assert.equal(phoneLead.diabetesType, 'Synthetic current answer')
})
