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
