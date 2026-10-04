import { useRef, useState, type FormEvent } from 'react'
import { ArrowUp, CalendarDays, LoaderCircle, MessageCircle, ShieldCheck, X } from 'lucide-react'
import { getConciergeReply, isAccuracyBoundary, isBindingQuoteRequest, sendLeadToProfessional, type ChatMessage } from './ChatAPI'
import { noopTracker, type AnalyticsTracker } from './analytics'
import { type UnderwritingState } from './types'
import { TCPA_DISCLOSURE, containsPhone, expressesUncertainty, firstName, isCorrection, isSmallTalk, isTcpaAgreement, useUnderwritingState } from './useUnderwritingState'

interface DisplayMessage extends ChatMessage {
  id: number
}

const schedulingUrl = import.meta.env.VITE_SCHEDULING_URL || 'https://calendly.com/'

// Match a person's typing rhythm: a brief, slightly varied pause before replying.
function pause(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 600 + Math.random() * 600))
}

// Vary intake prompts so the assistant sounds like a person, not a form.
const intakePrompts = [
  (label: string, name: string) => `When it feels natural, share ${label}${name ? `, ${name}` : ''}.`,
  (label: string, name: string) => `Whenever you're ready${name ? `, ${name}` : ''}, could you share ${label}?`,
  (label: string, name: string) => `${name ? `${name}, when` : 'When'} you have a moment, feel free to share ${label}.`,
]

interface ChatWidgetProps {
  trackEvent?: AnalyticsTracker
}

export function ChatWidget({ trackEvent = noopTracker }: ChatWidgetProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [sending, setSending] = useState(false)
  const [handoff, setHandoff] = useState('')
  const [messages, setMessages] = useState<DisplayMessage[]>([{
    id: 0,
    role: 'assistant',
    content: 'Hi! I can explain Term, Whole Life, and IUL in plain language. I can also help organize preliminary information for a licensed professional—no binding quotes or approval guarantees. What would you like to learn?',
  }])
  const { state, updateFromMessage, requestConsent, grantTcpaConsent, missingFields, skipCurrent } = useUnderwritingState()
  const scrollRef = useRef<HTMLDivElement>(null)
  const nextId = useRef(1)
  const tcpaPending = useRef(false)
  const name = firstName(state.fullName)
  const needsTcpa = missingFields[0] === 'your cell phone number' && !state.tcpa_consent_granted
  const summary = [
    ['Name', state.fullName],
    ['Email', state.email],
    ['Cell phone', state.cellPhone],
    ['TCPA consent', state.tcpa_consent_granted ? 'Granted' : ''],
    ['Consent timestamp', state.consent_timestamp],
    ['Text messages', state.textMessagePreference],
    ['Date of birth', state.dateOfBirth],
    ['Gender', state.gender],
    ['Height', state.height],
    ['Weight', state.weight],
    ['Tobacco / nicotine / vaping', state.tobaccoNicotineVaping],
    ['Policy type', state.policyType],
    ['Coverage amount', state.coverageAmount],
    ['Diabetes', state.hasDiabetes ? [state.diabetesType, state.diabetesTreatment, state.lastA1C && `A1C ${state.lastA1C}`].filter(Boolean).join(', ') || 'Mentioned; details not provided' : ''],
    ['Cancer', state.hasCancer ? [state.cancerType, state.cancerFreeDuration].filter(Boolean).join(', ') || 'Mentioned; details not provided' : ''],
  ].filter(([, value]) => value)

  function append(role: ChatMessage['role'], content: string) {
    setMessages((current) => [...current, { id: nextId.current++, role, content }])
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }))
  }

  // Deliver assistant messages the way a person would: a beat of typing, then the
  // reply, with optional follow-up bubbles a moment later.
  async function say(...contents: string[]) {
    setBusy(true)
    await pause()
    append('assistant', contents[0])
    for (const content of contents.slice(1)) {
      await pause()
      append('assistant', content)
    }
    setBusy(false)
  }

  // Acknowledge newly collected details like a person taking notes, then move on.
  function acknowledgment(before: UnderwritingState, after: UnderwritingState): string {
    const greeting = name ? `Thanks, ${name}` : 'Thank you'
    const captured: string[] = []
    if (!before.fullName && after.fullName) return `Thanks, ${firstName(after.fullName)}! It's nice to meet you.`
    if (!before.dateOfBirth && after.dateOfBirth) captured.push('your date of birth')
    if (!before.email && after.email) captured.push('your email')
    if (!before.cellPhone && after.cellPhone) captured.push('your cell phone number')
    if (!before.height && after.height) captured.push('your height')
    if (!before.weight && after.weight) captured.push('your weight')
    if (!before.gender && after.gender) captured.push('your gender')
    if (!before.policyType && after.policyType) captured.push(`your interest in ${after.policyType}`)
    if (!before.coverageAmount && after.coverageAmount) captured.push('the coverage amount')
    if (!before.tobaccoNicotineVaping && after.tobaccoNicotineVaping) captured.push('your tobacco/nicotine use')
    if (!before.hasDiabetes && after.hasDiabetes) captured.push('your diabetes')
    if (!before.diabetesType && after.diabetesType) captured.push(`the diabetes type (${after.diabetesType})`)
    if (!before.diabetesTreatment && after.diabetesTreatment) captured.push('how your diabetes is managed')
    if (!before.lastA1C && after.lastA1C) captured.push('your last A1C')
    if (!before.hasCancer && after.hasCancer) captured.push('your cancer history')
    if (!before.cancerType && after.cancerType) captured.push('the cancer type')
    if (!before.cancerFreeDuration && after.cancerFreeDuration) captured.push('how long you have been cancer-free')
    if (!before.textMessagePreference && after.textMessagePreference) captured.push('your text-message preference')
    if (captured.length === 0) return ''
    const noted = captured.length > 2
      ? `${captured.slice(0, -1).join(', ')}, and ${captured.at(-1)}`
      : captured.join(' and ')
    return `${greeting} — I've noted ${noted}.`
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || busy) return
    setDraft('')
    append('user', text)
    if (!state.tcpa_consent_granted) {
      // The disclosure invites typing "I AGREE" and stays visible while the phone
      // step is next, so honor it even if no phone number was volunteered first.
      if (isTcpaAgreement(text) && (tcpaPending.current || needsTcpa)) {
        tcpaPending.current = false
        grantTcpaConsent()
        await say('Thank you for your consent. Please share your cell phone number.')
        return
      }
      // Let "skip"/"no texts" replies reach the state collector before the phone
      // gate, or they are mistaken for a phone number and the phone prompt repeats.
      if (needsTcpa && (expressesUncertainty(text) || /\b(no|don't|do not|not)\b.*\b(text|sms)\b/i.test(text))) {
        updateFromMessage(text)
        await say(`No problem${name ? `, ${name}` : ''} — I've noted that.`)
        return
      }
      if (containsPhone(text)) {
        tcpaPending.current = true
        await say('I can’t save that phone number yet, so I discarded it.', `${TCPA_DISCLOSURE} Afterward, please share your number again.`)
        return
      }
    }
    const { result: consentResponse, state: updated } = updateFromMessage(text)

    if (isAccuracyBoundary(text)) {
      await say('Trust and estate questions can have important legal and personal consequences. I can’t advise on them, but I can connect you with a licensed human expert to discuss your situation.')
      return
    }
    if (consentResponse === 'accepted') {
      await say('Thank you. Please share your full name to start. You may skip any question, and you can stop at any time.')
      return
    }
    if (consentResponse === 'declined') {
      await say('No problem. We can keep this educational and you do not need to share personal information.')
      return
    }
    if (isBindingQuoteRequest(text)) {
      await say('I can’t provide a binding quote or guarantee a rate or underwriting class. Only an insurer can determine that after reviewing an application. A licensed professional can help compare options.')
      return
    }
    if (!state.consented && /\b(quote|apply|coverage amount|talk to an agent|pre[- ]underwrit)\b/i.test(text)) {
      requestConsent()
      await say('I can collect preliminary information to help a licensed professional prepare, including health details. It is optional and does not create an application or determine eligibility. May I gather that information?')
      return
    }
    if (state.consented) {
      if (expressesUncertainty(text)) {
        await say(`That's completely fine${name ? `, ${name}` : ''} — you can skip any question or give your best estimate. A licensed professional can confirm the details later.`)
        return
      }
      if (isCorrection(text)) {
        const corrected: string[] = []
        if (updated.email !== state.email) corrected.push('email')
        if (updated.cellPhone !== state.cellPhone) corrected.push('phone number')
        if (updated.fullName !== state.fullName) corrected.push('name')
        if (updated.textMessagePreference !== state.textMessagePreference) corrected.push('text-message preference')
        if (corrected.length > 0) {
          await say(`No problem — I've updated your ${corrected.join(' and ')}.`)
          return
        }
      }
      const note = acknowledgment(state, updated)
      if (note) {
        await say(note)
        return
      }
      if (isSmallTalk(text)) {
        const prompt = missingFields[0]
        await say(prompt
          ? `You're welcome! ${intakePrompts[0](prompt, name)}`
          : 'Happy to help! Your preliminary summary is ready whenever you’d like to send it.')
        return
      }
    }

    setBusy(true)
    const contextMessages = [...messages, { id: nextId.current, role: 'user' as const, content: text }]
      .map(({ role, content }) => ({ role, content }))
    try {
      const reply = await getConciergeReply(contextMessages)
      append('assistant', reply)
    } catch {
      append('assistant', 'I’m having trouble reaching the chat service. I can still share general information: Term coverage lasts for a selected period; Whole Life and IUL are forms of permanent coverage with different policy features. A licensed professional can explain what may fit your needs.')
    } finally {
      setBusy(false)
    }
  }

  async function sendToProfessional() {
    if (sending) return
    // Don't deliver an empty record to the CRM; require at least one identity
    // or contact detail so the handoff is actionable for the professional.
    if (!state.fullName && !state.email && !state.cellPhone) {
      setHandoff('Please share at least your name, email, or cell phone before sending your summary.')
      return
    }
    setHandoff('')
    setSending(true)
    try {
      await sendLeadToProfessional(state)
      trackEvent({ event: 'pre_underwriting_handoff', policy_type: state.policyType })
      setHandoff('Your preliminary summary was securely sent. Please schedule a conversation with a licensed professional below.')
    } catch {
      setHandoff('The secure handoff is not available right now. You can still schedule a conversation with a licensed professional.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-[9998] flex flex-col items-end justify-end gap-5 p-10 font-sans text-[#263238] max-[520px]:p-3">
      {open && (
        <section
          aria-label="Pre-underwriting concierge"
          className="pointer-events-auto flex h-[min(680px,calc(100vh-156px))] max-h-[760px] w-[min(410px,calc(100vw-112px))] flex-col gap-5 overflow-hidden rounded-2xl border border-brand-accent bg-white p-5 shadow-[0_16px_48px_#1c2c3033] max-[520px]:h-[min(680px,calc(100dvh-92px))] max-[520px]:max-h-none max-[520px]:w-screen max-[520px]:rounded-none max-[520px]:p-0"
        >
          <header className="flex items-center justify-between border-b border-brand-accent bg-brand-bg px-[18px] py-4">
            <div className="flex items-center gap-3">
              <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-white text-brand-primary">
                <ShieldCheck size={20} aria-hidden="true" />
              </span>
              <div>
                <strong className="block text-[15px] text-brand-alert">Coverage Concierge</strong>
                <span className="mt-[3px] block text-xs text-[#526066]">Educational support · Not an insurer</span>
              </div>
            </div>
            <button className="cursor-pointer border-0 bg-transparent p-1.5 text-brand-accent" onClick={() => setOpen(false)} aria-label="Close chat">
              <X size={20} />
            </button>
          </header>
          <div ref={scrollRef} aria-live="polite" className="flex flex-1 flex-col gap-3.5 overflow-y-auto p-5">
            {messages.map((message) => (
              <div
                key={message.id}
                className={message.role === 'user'
                  ? 'max-w-[88%] self-end whitespace-pre-wrap rounded-[14px] bg-brand-primary px-3.5 py-[11px] leading-[1.5] text-white'
                  : 'max-w-[88%] self-start whitespace-pre-wrap rounded-[14px] border border-[#cbd5dd] bg-brand-bg px-3.5 py-[11px] leading-[1.5]'}
              >
                <p className="m-0">{message.content}</p>
              </div>
            ))}
            {busy && (
              <div
                aria-label="Assistant is typing"
                className="flex max-w-[88%] items-center gap-2 self-start whitespace-pre-wrap rounded-[14px] border border-[#cbd5dd] bg-brand-bg px-3.5 py-[11px] text-[13px] leading-[1.5] text-brand-accent"
              >
                <LoaderCircle className="animate-spin" size={18} /> Thinking…
              </div>
            )}
            {state.consented && missingFields.length > 0 && (
              <div className="flex items-center justify-between px-1 text-xs text-brand-accent">
                {needsTcpa ? (
                  <>
                    <span>{TCPA_DISCLOSURE}</span>
                    <button
                      type="button"
                      className="cursor-pointer rounded-lg border-0 bg-brand-primary px-3 py-2.5 text-white transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_#18211655]"
                      onClick={() => { tcpaPending.current = false; grantTcpaConsent() }}
                    >
                      I AGREE
                    </button>
                  </>
                ) : <span>{intakePrompts[messages.length % intakePrompts.length](missingFields[0], name)}{missingFields.length > 1 && missingFields.length <= 3 ? ` Only ${missingFields.length} more to go.` : ''}</span>}
                <button type="button" className="cursor-pointer border-0 bg-transparent text-xs text-brand-primary underline" onClick={skipCurrent}>Skip this question</button>
              </div>
            )}
            {state.consented && missingFields.length === 0 && (
              <div className="flex flex-col gap-2.5 rounded-xl border border-brand-accent bg-[#f7f8f5] p-3.5">
                <strong className="text-brand-alert">Preliminary summary ready</strong>
                <dl className="m-0 grid max-h-[150px] gap-1.5 overflow-y-auto">
                  {summary.map(([label, value]) => (
                    <div key={label} className="grid grid-cols-[42%_1fr] gap-2 text-xs">
                      <dt className="font-semibold text-brand-accent">{label}</dt>
                      <dd className="m-0 break-all">{value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="m-0 text-[13px] leading-[1.5]">This is not an application, quote, or eligibility decision. A licensed professional can review your information.</p>
                <button
                  className="cursor-pointer rounded-lg border-0 bg-brand-primary px-3 py-2.5 text-white transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_#18211655]"
                  onClick={sendToProfessional}
                  disabled={sending}
                >
                  {sending ? 'Sending…' : 'Send summary securely'}
                </button>
                {handoff && <p role="status" className="m-0 text-[13px] leading-[1.5]">{handoff}</p>}
                <a className="flex items-center gap-[7px] text-[13px] font-semibold text-brand-primary underline" href={schedulingUrl} target="_blank" rel="noreferrer">
                  <CalendarDays size={16} /> Schedule a conversation
                </a>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 border-t border-[#d7dfe4] bg-[#f8fafc] px-4 py-[9px] text-[11px] text-brand-accent">
            <ShieldCheck size={14} aria-hidden="true" /> Share only what you’re comfortable sharing.
          </div>
          <form className="flex items-end gap-2.5 border-t border-[#d7dfe4] p-3" onSubmit={submit}>
            <label className="sr-only" htmlFor="concierge-message">Your message</label>
            <textarea
              id="concierge-message"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault()
                  event.currentTarget.form?.requestSubmit()
                }
              }}
              placeholder="Ask a question…"
              rows={1}
              disabled={busy}
              className="max-h-[100px] w-full resize-y rounded-xl border border-[#9aa9ad] p-[11px_12px] font-[inherit] outline-brand-accent"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              aria-label="Send message"
              className="flex h-[42px] min-w-[42px] cursor-pointer items-center justify-center rounded-full border-0 bg-brand-primary text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ArrowUp size={19} />
            </button>
          </form>
        </section>
      )}
      <button
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label={open ? 'Close chat' : 'Open coverage concierge'}
        className="pointer-events-auto flex min-h-14 cursor-pointer items-center gap-2.5 rounded-full border-0 bg-brand-primary px-5 font-[inherit] text-white shadow-[0_8px_24px_#18211655] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_#18211655]"
      >
        {open ? <X size={23} /> : <MessageCircle size={23} />}
        <span>{open ? 'Close' : 'Ask a question'}</span>
      </button>
    </div>
  )
}
