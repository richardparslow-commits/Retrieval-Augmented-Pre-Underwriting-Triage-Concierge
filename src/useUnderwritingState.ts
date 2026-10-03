import { useCallback, useMemo, useRef, useState } from 'react'
import { initialUnderwritingState, type UnderwritingState } from './types'

const affirmative = /\b(yes|yep|sure|okay|ok|go ahead|that's fine|that is fine)\b/i
const negative = /\b(no|no thanks|not now|rather not)\b/i
const tcpaAffirmative = /^[\s\p{P}]*I\s+AGREE[\s\p{P}]*$/iu
const phonePattern = /(?:^|\D)(\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})(?:\D|$)/
const policyTypes: UnderwritingState['policyType'][] = ['Term', 'Whole Life', 'IUL']

function capture(text: string, pattern: RegExp): string {
  return text.match(pattern)?.[1]?.trim() ?? ''
}

export function useUnderwritingState() {
  const [state, setState] = useState(initialUnderwritingState)
  const [skippedFields, setSkippedFields] = useState<Set<keyof UnderwritingState>>(() => new Set())
  const underwritingConsentPending = useRef(false)
  const tcpaConsentPendingRef = useRef(false)
  const [tcpaConsentPending, setTcpaConsentPending] = useState(false)

  const collect = useCallback((text: string) => {
    setState((current) => {
      const next = { ...current }
      const email = capture(text, /\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i)
      const phone = capture(text, phonePattern)
      const name = capture(text, /\b(?:my name is|i am|i'm|this is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/)
      const dob = capture(text, /\b(?:dob|date of birth|born on|born)\s*(?:is|:)?\s*((?:\d{1,2}[/-]){2}\d{2,4}|\d{4}-\d{2}-\d{2})/i)
      const a1c = capture(text, /\b(?:a1c|a1c is|a1c was)\s*(?:of|around|about|is|was|:)?\s*(\d{1,2}(?:\.\d{1,2})?%?)/i)
      const amount = capture(text, /\$\s?([\d,]+(?:\.\d{2})?)/)
      const height = capture(text, /\b((?:\d\s*(?:ft|feet|')\s*\d{1,2}\s*(?:in|inches|")?)|(?:\d{2,3}\s?cm))\b/i)
      const weight = capture(text, /\b(?:weigh(?:t|ing)?(?:\s+is)?|i am|i'm)\s+(\d{2,3})\s?(?:lb|lbs|pounds)\b/i)

      if (email) next.email = email
      if (phone && current.tcpaConsentGranted) next.cellPhone = phone.replace(/[^\d+]/g, '')
      if (name) next.fullName = name
      if (dob) next.dateOfBirth = dob
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

      return next
    })
  }, [])

  const requestConsent = useCallback(() => {
    underwritingConsentPending.current = true
  }, [])

  const requestTcpaConsent = useCallback(() => {
    tcpaConsentPendingRef.current = true
    setTcpaConsentPending(true)
  }, [])

  const grantTcpaConsent = useCallback(() => {
    tcpaConsentPendingRef.current = false
    setTcpaConsentPending(false)
    setState((current) => ({
      ...current,
      tcpaConsentGranted: true,
      tcpaConsentTimestamp: new Date().toISOString(),
    }))
  }, [])

  const updateFromMessage = useCallback((text: string): 'accepted' | 'declined' | 'tcpa-accepted' | 'tcpa-pending' | null => {
    if (tcpaConsentPendingRef.current) {
      if (tcpaAffirmative.test(text)) {
        grantTcpaConsent()
        return 'tcpa-accepted'
      }
      return 'tcpa-pending'
    }

    let underwritingAccepted = false
    if (underwritingConsentPending.current) {
      underwritingConsentPending.current = false
      if (negative.test(text)) return 'declined'
      if (affirmative.test(text)) {
        setState((current) => ({ ...current, consented: true }))
        underwritingAccepted = true
      }
    }

    if (phonePattern.test(text) && !state.tcpaConsentGranted) {
      requestTcpaConsent()
      if (state.consented || underwritingAccepted) collect(text)
      return 'tcpa-pending'
    }
    if (underwritingAccepted) {
      collect(text)
      return 'accepted'
    }
    if (state.consented) collect(text)
    return null
  }, [collect, grantTcpaConsent, requestTcpaConsent, state.consented, state.tcpaConsentGranted])

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

  return {
    state,
    updateFromMessage,
    requestConsent,
    tcpaConsentPending,
    requestTcpaConsent,
    grantTcpaConsent,
    missingFields,
    skipCurrent,
  }
}
