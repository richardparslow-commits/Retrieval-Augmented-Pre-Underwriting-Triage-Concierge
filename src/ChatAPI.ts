import { type UnderwritingState } from './types'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export function isAccuracyBoundary(text: string): boolean {
  return /\b(estate planning|estate plan|trusts?|last will(?: and testament)?|will and testament|(?:my|a|the) will|inheritance strategy)\b/i.test(text)
}

export function isBindingQuoteRequest(text: string): boolean {
  return /\b(exact|guaranteed|binding|final)\b.*\b(quote|premium|rate|price)\b|\b(quote|premium|rate|price)\b.*\b(exact|guaranteed|binding|final)\b/i.test(text)
}

export async function getConciergeReply(messages: ChatMessage[]): Promise<string> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  })
  if (!response.ok) throw new Error('Chat service is unavailable')
  const data: unknown = await response.json()
  if (
    typeof data === 'object' &&
    data !== null &&
    'reply' in data &&
    typeof data.reply === 'string'
  ) return data.reply
  throw new Error('Chat service returned an unexpected response')
}

export function buildLeadPayload(state: UnderwritingState): UnderwritingState {
  // Never assert TCPA consent for a phone number we don't hold.
  return state.cellPhone
    ? state
    : { ...state, tcpa_consent_granted: false, consent_timestamp: '' }
}

export async function sendLeadToProfessional(state: UnderwritingState): Promise<void> {
  const response = await fetch('/api/lead', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildLeadPayload(state)),
  })
  if (!response.ok) throw new Error('Handoff failed')
}
