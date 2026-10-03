export interface LeadPayload {
  consented: true
  tcpa_consent_granted: boolean
  consent_timestamp: string
  fullName: string
  email: string
  cellPhone: string
  textMessagePreference: 'yes' | 'no' | ''
  dateOfBirth: string
  gender: string
  height: string
  weight: string
  tobaccoNicotineVaping: string
  policyType: 'Term' | 'Whole Life' | 'IUL' | ''
  coverageAmount: string
  hasDiabetes: boolean
  diabetesType: string
  diabetesTreatment: string
  lastA1C: string
  hasCancer: boolean
  cancerType: string
  cancerFreeDuration: string
}

function isValidIsoTimestamp(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value)
  if (!match || !Number.isFinite(Date.parse(value))) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1]
}

function isLeadPayload(value: unknown): value is LeadPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const payload = value as Partial<LeadPayload>
  const stringFields: (keyof LeadPayload)[] = [
    'consent_timestamp', 'fullName', 'email', 'cellPhone', 'textMessagePreference', 'dateOfBirth', 'gender',
    'height', 'weight', 'tobaccoNicotineVaping', 'policyType', 'coverageAmount',
    'diabetesType', 'diabetesTreatment', 'lastA1C', 'cancerType', 'cancerFreeDuration',
  ]
  return payload.consented === true &&
    typeof payload.tcpa_consent_granted === 'boolean' &&
    typeof payload.hasDiabetes === 'boolean' &&
    typeof payload.hasCancer === 'boolean' &&
    stringFields.every((field) => typeof payload[field] === 'string' && payload[field]!.length <= 200) &&
    typeof payload.email === 'string' &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) &&
    typeof payload.cellPhone === 'string' &&
    payload.cellPhone.length <= 30 &&
    (payload.cellPhone.length === 0 ||
      (payload.tcpa_consent_granted === true &&
        typeof payload.consent_timestamp === 'string' &&
        isValidIsoTimestamp(payload.consent_timestamp))) &&
    (payload.policyType === '' || payload.policyType === 'Term' || payload.policyType === 'Whole Life' || payload.policyType === 'IUL') &&
    (payload.textMessagePreference === '' || payload.textMessagePreference === 'yes' || payload.textMessagePreference === 'no')
}

export async function handleWebhookRequest(request: Request): Promise<Response> {
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 })

  const raw = await request.text()
  if (raw.length > 16_384) return Response.json({ error: 'Payload too large' }, { status: 413 })

  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    return Response.json({ error: 'Invalid JSON payload' }, { status: 400 })
  }
  if (!isLeadPayload(payload)) return Response.json({ error: 'Valid consent and contact information are required' }, { status: 400 })

  const env = (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
  const webhookUrl = env.CRM_WEBHOOK_URL
  const secret = env.CRM_WEBHOOK_SECRET
  if (!webhookUrl || !secret) return Response.json({ error: 'CRM integration is not configured' }, { status: 503 })

  let destination: URL
  try {
    destination = new URL(webhookUrl)
  } catch {
    return Response.json({ error: 'CRM integration is not configured' }, { status: 503 })
  }
  if (destination.protocol !== 'https:') return Response.json({ error: 'CRM integration must use HTTPS' }, { status: 503 })

  try {
    const result = await fetch(destination, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: ['Bearer', secret].join(' ') },
      body: JSON.stringify({
        consented: payload.consented,
        tcpa_consent_granted: payload.tcpa_consent_granted,
        consent_timestamp: payload.consent_timestamp,
        fullName: payload.fullName,
        email: payload.email,
        cellPhone: payload.cellPhone,
        textMessagePreference: payload.textMessagePreference,
        dateOfBirth: payload.dateOfBirth,
        gender: payload.gender,
        height: payload.height,
        weight: payload.weight,
        tobaccoNicotineVaping: payload.tobaccoNicotineVaping,
        policyType: payload.policyType,
        coverageAmount: payload.coverageAmount,
        hasDiabetes: payload.hasDiabetes,
        diabetesType: payload.diabetesType,
        diabetesTreatment: payload.diabetesTreatment,
        lastA1C: payload.lastA1C,
        hasCancer: payload.hasCancer,
        cancerType: payload.cancerType,
        cancerFreeDuration: payload.cancerFreeDuration,
        receivedAt: new Date().toISOString(),
      }),
      redirect: 'error',
    })
    if (!result.ok) return Response.json({ error: 'CRM handoff failed' }, { status: 502 })
    return Response.json({ ok: true })
  } catch {
    return Response.json({ error: 'CRM handoff failed' }, { status: 502 })
  }
}
