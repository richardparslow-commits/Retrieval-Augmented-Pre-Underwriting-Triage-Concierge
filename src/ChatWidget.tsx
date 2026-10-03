import { useRef, useState, type FormEvent } from 'react'
import { ArrowUp, CalendarDays, LoaderCircle, MessageCircle, ShieldCheck, X } from 'lucide-react'
import { getConciergeReply, isAccuracyBoundary, isBindingQuoteRequest, type ChatMessage } from './ChatAPI'
import { useUnderwritingState } from './useUnderwritingState'

interface DisplayMessage extends ChatMessage {
  id: number
}

const schedulingUrl = import.meta.env.VITE_SCHEDULING_URL || 'https://calendly.com/'

export function ChatWidget() {
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
  const { state, updateFromMessage, requestConsent, missingFields, skipCurrent } = useUnderwritingState()
  const scrollRef = useRef<HTMLDivElement>(null)
  const nextId = useRef(1)
  const summary = [
    ['Name', state.fullName],
    ['Email', state.email],
    ['Cell phone', state.cellPhone],
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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || busy) return
    setDraft('')
    append('user', text)
    const consentResponse = updateFromMessage(text)

    if (isAccuracyBoundary(text)) {
      append('assistant', 'Trust and estate questions can have important legal and personal consequences. I can’t advise on them, but I can connect you with a licensed human expert to discuss your situation.')
      return
    }
    if (consentResponse === 'accepted') {
      append('assistant', 'Thank you. Please share your full name to start. You may skip any question, and you can stop at any time.')
      return
    }
    if (consentResponse === 'declined') {
      append('assistant', 'No problem. We can keep this educational and you do not need to share personal information.')
      return
    }
    if (isBindingQuoteRequest(text)) {
      append('assistant', 'I can’t provide a binding quote or guarantee a rate or underwriting class. Only an insurer can determine that after reviewing an application. A licensed professional can help compare options.')
      return
    }
    if (!state.consented && /\b(quote|apply|coverage amount|talk to an agent|pre[- ]underwrit)\b/i.test(text)) {
      requestConsent()
      append('assistant', 'I can collect preliminary information to help a licensed professional prepare, including health details. It is optional and does not create an application or determine eligibility. May I gather that information?')
      return
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
    setHandoff('')
    setSending(true)
    try {
      const response = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      })
      if (!response.ok) throw new Error('Handoff failed')
      window.dataLayer = window.dataLayer || []
      window.dataLayer.push({ event: 'pre_underwriting_handoff', policy_type: state.policyType })
      setHandoff('Your preliminary summary was securely sent. Please schedule a conversation with a licensed professional below.')
    } catch {
      setHandoff('The secure handoff is not available right now. You can still schedule a conversation with a licensed professional.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="concierge-widget flex flex-col gap-5 p-10">
      {open && (
        <section className="chat-panel flex flex-col gap-5" aria-label="Pre-underwriting concierge">
          <header className="chat-header">
            <div className="chat-title">
              <span className="chat-icon"><ShieldCheck size={20} aria-hidden="true" /></span>
              <div><strong>Coverage Concierge</strong><span>Educational support · Not an insurer</span></div>
            </div>
            <button className="icon-button" onClick={() => setOpen(false)} aria-label="Close chat"><X size={20} /></button>
          </header>
          <div className="chat-messages" ref={scrollRef} aria-live="polite">
            {messages.map((message) => (
              <div key={message.id} className={`message ${message.role}`}>
                <p>{message.content}</p>
              </div>
            ))}
            {busy && <div className="message assistant typing" aria-label="Assistant is typing"><LoaderCircle className="spin" size={18} /> Thinking…</div>}
            {state.consented && missingFields.length > 0 && (
              <div className="intake-status">
                <span>When it feels natural, share {missingFields[0]}.</span>
                <button className="skip-button" type="button" onClick={skipCurrent}>Skip this question</button>
              </div>
            )}
            {state.consented && missingFields.length === 0 && (
              <div className="handoff-card">
                <strong>Preliminary summary ready</strong>
                <dl>{summary.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
                <p>This is not an application, quote, or eligibility decision. A licensed professional can review your information.</p>
                <button className="primary-button" onClick={sendToProfessional} disabled={sending}>{sending ? 'Sending…' : 'Send summary securely'}</button>
                {handoff && <p role="status">{handoff}</p>}
                <a className="schedule-link" href={schedulingUrl} target="_blank" rel="noreferrer"><CalendarDays size={16} /> Schedule a conversation</a>
              </div>
            )}
          </div>
          <div className="privacy-note"><ShieldCheck size={14} aria-hidden="true" /> Share only what you’re comfortable sharing.</div>
          <form className="chat-composer" onSubmit={submit}>
            <label className="sr-only" htmlFor="concierge-message">Your message</label>
            <textarea id="concierge-message" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask a question…" rows={1} disabled={busy} />
            <button className="send-button" type="submit" disabled={busy || !draft.trim()} aria-label="Send message"><ArrowUp size={19} /></button>
          </form>
        </section>
      )}
      <button className="launcher" onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-label={open ? 'Close chat' : 'Open coverage concierge'}>
        {open ? <X size={23} /> : <MessageCircle size={23} />}
        <span>{open ? 'Close' : 'Ask a question'}</span>
      </button>
    </div>
  )
}
