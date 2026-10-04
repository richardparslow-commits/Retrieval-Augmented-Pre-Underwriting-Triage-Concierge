import { useCallback, useMemo, useRef, useState } from 'react'
import { initialUnderwritingState, type UnderwritingState } from './types'

const affirmative = /\b(yes|yep|sure|okay|ok|go ahead|that's fine|that is fine)\b/i
const negative = /\b(no|no thanks|not now|rather not)\b/i
const policyTypes: UnderwritingState['policyType'][] = ['Term', 'Whole Life', 'IUL']

export const TCPA_DISCLOSURE = 'By providing your phone number, you consent to be contacted by a licensed insurance professional at that number, including by calls and text messages that may use automated technology. Consent is not a condition of purchase, message and data rates may apply, and you can opt out at any time. Type "I AGREE" or select the button below to consent.'
const phonePattern = /(?:^|\D)(\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})(?:\D|$)/
const barePhonePattern = /(?:^|\D)(1?[\s.-]?\d{3}[\s.-]\d{4})(?:\D|$)/
const tcpaAgreement = /^\s*i\s+agree[.!\s]*$/i

export function containsPhone(text: string): boolean {
  return phonePattern.test(text) || barePhonePattern.test(text)
}

export function isTcpaAgreement(text: string): boolean {
  return tcpaAgreement.test(text)
}

const uncertaintyPattern = /\b(not sure|don'?t know|do not know|no idea|maybe|not certain|can'?t remember|unsure)\b/i
const correctionPattern = /\b(actually|i meant|that'?s wrong|correction|i misspoke|wrong (?:email|number|name))\b/i
const smallTalkPattern = /^\s*(hi|hello|hey|good (?:morning|afternoon|evening)|thanks|thank you|thx|lol|haha|ok(?:ay)?|cool|great|nice|got it|bye)[\s!.,?]*$/i

export function expressesUncertainty(text: string): boolean {
  return uncertaintyPattern.test(text)
}

export function isCorrection(text: string): boolean {
  return correctionPattern.test(text)
}

export function isSmallTalk(text: string): boolean {
  return smallTalkPattern.test(text)
}

// Reject impossible or future calendar dates (e.g. 13/45/2099) before they are
// forwarded to the CRM as a date of birth.
export function isPlausibleDateOfBirth(value: string): boolean {
  const match = value.match(/^(\d{1,4})[/-](\d{1,2})[/-](\d{1,4})$/)
  if (!match) return false
  const [, first, second, third] = match
  const parts = first.length === 4
    ? { year: Number(first), month: Number(second), day: Number(third) }
    : { year: Number(third), month: Number(first), day: Number(second) }
  if (parts.year < 1900 || parts.month < 1 || parts.month > 12) return false
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
  if (date.getUTCFullYear() !== parts.year || date.getUTCMonth() !== parts.month - 1 || date.getUTCDate() !== parts.day) return false
  return date.getTime() <= Date.now()
}

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? ''
}

function capture(text: string, pattern: RegExp): string {
  return text.match(pattern)?.[1]?.trim() ?? ''
}

export function useUnderwritingState() {
  const [state, setState] = useState(initialUnderwritingState)
  const [skippedFields, setSkippedFields] = useState<Set<keyof UnderwritingState>>(() => new Set())
  const consentPending = useRef(false)
  const tcpaGranted = useRef(false)
  // Mirror of the latest state, updated synchronously inside collect() so callers
  // can diff what a message changed without waiting for React to re-render.
  const latest = useRef(state)

  const collect = useCallback((text: string): UnderwritingState => {
    const next = { ...latest.current }
    {
      const email = capture(text, /\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i)
      const phone = tcpaGranted.current ? capture(text, phonePattern) : ''
      const name = capture(text, /\b(?:my name is|i am|i'm|this is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/)
      const dob = capture(text, /\b(?:dob|date of birth|born on|born)\s*(?:is|:)?\s*((?:\d{1,2}[/-]){2}\d{2,4}|\d{4}-\d{2}-\d{2})/i)
      const a1c = capture(text, /\b(?:a1c|a1c is|a1c was)\s*(?:of|around|about|is|was|:)?\s*(\d{1,2}(?:\.\d{1,2})?%?)/i)
      const amount = capture(text, /\$\s?([\d,]+(?:\.\d{2})?)/)
      const height = capture(text, /\b((?:\d\s*(?:ft|feet|foot|'|’)\s*\d{1,2}\s*(?:in|inches|")?)|(?:\d\s+\d{1,2})(?=\s*(?:tall|ft|feet|foot|$))|(?:\d{2,3}\s?cm))\b/i)
      const weightMatch = text.match(/\b(?:(?:weigh(?:t|ing|s)?(?:\s+is)?|i am|i'm)\s+)?(\d{2,3})\s?(?:lb|lbs|pounds)\b|\bweigh(?:ing)?\s+(\d{2,3})\b/i)
      const weight = (weightMatch?.[1] ?? weightMatch?.[2] ?? '').trim()

      if (email) next.email = email
      if (phone) next.cellPhone = phone.replace(/[^\d+]/g, '')
      if (name) next.fullName = name
      if (dob && isPlausibleDateOfBirth(dob)) next.dateOfBirth = dob
      if (a1c) next.lastA1C = a1c
      if (height) next.height = height
      if (weight) next.weight = `${weight} lb`

      const normalized = text.toLowerCase()
      if (/\bdiabetes\b/i.test(text)) next.hasDiabetes = true
      if (/\bcancer\b/i.test(text)) next.hasCancer = true
      if (/\b(type\s?1|type one)\b/.test(normalized)) next.diabetesType = 'Type 1'
      if (/\b(type\s?2|type two)\b/.test(normalized)) next.diabetesType = 'Type 2'
      if (/\b(insulin)\b/.test(normalized)) next.diabetesTreatment = 'Insulin'
      else if (/\b(pills?|oral medication|tablets?)\b/.test(normalized)) next.diabetesTreatment = 'Pills'

      const cancer = capture(text, /\b(?:have|had|diagnosed with)\s+([a-z][a-z -]{1,40}?)\s+cancer\b/i)
      const remission = capture(text, /\b(?:in remission|cancer[- ]free|free of cancer)\s+(?:for|since)\s+([^.,;]+)/i)
      if (cancer) next.cancerType = cancer
      if (remission) next.cancerFreeDuration = remission
      if (/\b(tobacco|nicotine|vaping|vape|smok(?:e|er|ing))\b/i.test(text)) {
        next.tobaccoNicotineVaping = /\b(no|never|quit|stopped)\b/i.test(text) ? 'No/currently stopped' : 'Yes/mentioned'
      }
      if (/\b(text|sms)\b/i.test(text) && /\b(yes|please|prefer|okay|ok)\b/i.test(text)) next.textMessagePreference = 'yes'
      if (/\b(no|don't|do not|not)\b.*\b(text|sms)\b/i.test(text)) next.textMessagePreference = 'no'
      const chosenPolicy = policyTypes.find((policy) => normalized.includes(policy.toLowerCase()))
      if (chosenPolicy) next.policyType = chosenPolicy
      if (amount && /\b(coverage|policy|million|thousand)\b/i.test(text)) next.coverageAmount = `$${amount}`
      if (/\b(female|woman|women)\b/i.test(text)) next.gender = 'Female'
      if (/\b(male|man|men)\b/i.test(text)) next.gender = 'Male'
      if (/\b(non[- ]?binary|genderqueer)\b/i.test(text)) next.gender = 'Non-binary'
      if (/\b(prefer not to say|prefer not to answer)\b/i.test(text)) next.gender = 'Prefer not to say'
    }

    latest.current = next
    setState(next)
    return next
  }, [])

  const grantTcpaConsent = useCallback(() => {
    if (tcpaGranted.current) return
    tcpaGranted.current = true
    const next = { ...latest.current, tcpa_consent_granted: true, consent_timestamp: new Date().toISOString() }
    latest.current = next
    setState(next)
  }, [])

  const requestConsent = useCallback(() => {
    consentPending.current = true
  }, [])

  const updateFromMessage = useCallback((text: string): { result: 'accepted' | 'declined' | null; state: UnderwritingState } => {
    if (consentPending.current) {
      consentPending.current = false
      if (negative.test(text)) return { result: 'declined', state: latest.current }
      if (affirmative.test(text)) {
        const consentedState = { ...latest.current, consented: true }
        latest.current = consentedState
        setState(consentedState)
        return { result: 'accepted', state: collect(text) }
      }
    }
    if (latest.current.consented) return { result: null, state: collect(text) }
    return { result: null, state: latest.current }
  }, [collect])

  const pendingFields = useMemo(() => {
    if (!state.consented) return []
    const fields: [keyof UnderwritingState, string][] = [
      ['fullName', 'your full name'],
      ['email', 'your email address'],
      ['cellPhone', 'your cell phone number'],
      ['textMessagePreference', 'whether you are comfortable receiving text messages'],
      ['dateOfBirth', 'your date of birth'],
      ['gender', 'your gender'],
      ['height', 'your height'],
      ['weight', 'your weight'],
      ['tobaccoNicotineVaping', 'whether you use tobacco, nicotine, or vape'],
      ['policyType', 'the policy type you are considering (Term, Whole Life, or IUL)'],
      ['coverageAmount', 'the coverage amount you are considering'],
    ]
    if (state.hasDiabetes) {
      fields.push(['diabetesType', 'whether it is Type 1 or Type 2 diabetes'])
      fields.push(['diabetesTreatment', 'whether diabetes is managed with pills or insulin'])
      fields.push(['lastA1C', 'your most recent A1C, if you know it'])
    }
    if (state.hasCancer) {
      fields.push(['cancerType', 'the type of cancer'])
      fields.push(['cancerFreeDuration', 'how long you have been in remission or cancer-free'])
    }
    return fields.filter(([key]) => !state[key] && !skippedFields.has(key))
  }, [skippedFields, state])
  const missingFields = pendingFields.map(([, label]) => label)
  const skipCurrent = useCallback(() => {
    const key = pendingFields[0]?.[0]
    if (key) setSkippedFields((current) => new Set(current).add(key))
  }, [pendingFields])

  return { state, updateFromMessage, requestConsent, grantTcpaConsent, missingFields, skipCurrent }
}
