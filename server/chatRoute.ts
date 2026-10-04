interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// Roles a caller may send. Server-side/system instructions must come only from
// the route itself, or a client could override the concierge's guardrails.
const ALLOWED_ROLES = new Set<ChatMessage['role']>(['user', 'assistant'])

const knowledge = [
  {
    terms: ['term', 'temporary', 'renewable'],
    text: 'Term life insurance provides coverage for a selected period. It is often considered when people want a larger death benefit for a temporary need, such as income replacement or a mortgage. Premiums and renewal options depend on the policy.',
  },
  {
    terms: ['whole life', 'permanent', 'cash value'],
    text: 'Whole life is a type of permanent life insurance that may include guaranteed premiums, a guaranteed death benefit, and cash value growth as described in the contract. Costs and policy features vary.',
  },
  {
    terms: ['iul', 'indexed universal', 'index universal'],
    text: 'Indexed universal life is permanent coverage with flexible premiums and interest crediting linked to an external index under policy-specific caps, floors, and charges. Index performance is not a direct investment return.',
  },
  {
    terms: ['underwriting', 'health', 'medical', 'approval', 'diabetes', 'cancer'],
    text: 'Underwriting is the insurer’s review of an application and risk information. Health history can affect eligibility, pricing, and available products; only the insurer can make an underwriting decision.',
  },
]

function isChatMessages(value: unknown): value is ChatMessage[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 20) return false
  return value.every((message) =>
    typeof message === 'object' &&
    message !== null &&
    ((message as ChatMessage).role === 'user' || (message as ChatMessage).role === 'assistant') &&
    ALLOWED_ROLES.has((message as ChatMessage).role) &&
    typeof (message as ChatMessage).content === 'string' &&
    (message as ChatMessage).content.length <= 4_000,
  )
}

function retrieveContext(question: string): string {
  const query = question.toLowerCase()
  return knowledge
    .map((entry) => ({ ...entry, score: entry.terms.filter((term) => query.includes(term)).length }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 2)
    .map((entry) => entry.text)
    .join('\n')
}

export async function handleChatRequest(request: Request): Promise<Response> {
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 })
  const raw = await request.text()
  if (raw.length > 32_768) return Response.json({ error: 'Payload too large' }, { status: 413 })

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return Response.json({ error: 'Invalid JSON payload' }, { status: 400 })
  }
  const messages = typeof body === 'object' && body !== null && 'messages' in body ? body.messages : undefined
  if (!isChatMessages(messages) || messages.at(-1)?.role !== 'user') {
    return Response.json({ error: 'Valid conversation messages are required' }, { status: 400 })
  }

  const env = (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
  let endpoint: URL
  try {
    endpoint = new URL(env.OPENAI_COMPATIBLE_URL || 'https://api.openai.com/v1/chat/completions')
  } catch {
    return Response.json({ error: 'Chat service is not configured' }, { status: 503 })
  }
  if (endpoint.protocol !== 'https:') {
    return Response.json({ error: 'Chat service is not configured' }, { status: 503 })
  }
  // Only read the key after the endpoint is validated so a misconfigured
  // non-HTTPS URL can never receive it.
  const apiKey = env.OPENAI_API_KEY
  if (!apiKey) {
    return Response.json({ error: 'Chat service is not configured' }, { status: 503 })
  }

  const context = retrieveContext(messages.at(-1)!.content)
  const systemPrompt = [
    'You are an empathetic life-insurance education and pre-underwriting concierge.',
    'Use only the approved reference context below for product-specific facts. If it does not answer the question, say so and offer a licensed human expert.',
    'Never provide a binding quote, legal declaration, or guarantee underwriting-class approval. Do not provide estate-planning or trust advice; immediately offer a human expert for those questions.',
    'When a person mentions diabetes, gently ask whether it is managed with pills or insulin, their last A1C, and whether it is Type 1 or Type 2. When cancer is mentioned, gently ask what type and how long they have been in remission or cancer-free. Be reassuring and do not imply these conditions prevent coverage.',
    `Approved reference context:\n${context || 'No matching product reference was found.'}`,
  ].join('\n\n')

  try {
    const result = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: ['Bearer', apiKey].join(' ') },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    })
    if (!result.ok) return Response.json({ error: 'Chat service is unavailable' }, { status: 502 })
    const data: unknown = await result.json()
    if (
      typeof data === 'object' &&
      data !== null &&
      'choices' in data &&
      Array.isArray(data.choices) &&
      typeof data.choices[0] === 'object' &&
      data.choices[0] !== null &&
      'message' in data.choices[0] &&
      typeof data.choices[0].message === 'object' &&
      data.choices[0].message !== null &&
      'content' in data.choices[0].message &&
      typeof data.choices[0].message.content === 'string'
    ) return Response.json({ reply: data.choices[0].message.content })
    return Response.json({ error: 'Chat service returned an unexpected response' }, { status: 502 })
  } catch {
    return Response.json({ error: 'Chat service is unavailable' }, { status: 502 })
  }
}
