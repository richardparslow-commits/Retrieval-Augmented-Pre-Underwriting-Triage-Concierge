import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getConciergeReply } from '../src/ChatAPI.ts'

test('keeps the latest question and drops oldest turns to fit the UTF-8 budget', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({ reply: 'Synthetic reply' }))
  const history = Array.from({ length: 20 }, (_, index) => ({
    role: index % 2 ? 'assistant' : 'user',
    content: String(index) + '界'.repeat(3_990),
  }))
  const latest = { role: 'user', content: 'What is term life?' }
  assert.equal(await getConciergeReply([...history, latest]), 'Synthetic reply')
  const [url, options] = fetch.mock.calls[0].arguments
  assert.equal(url, '/api/chat')
  assert.ok(new TextEncoder().encode(options.body).byteLength <= 32_768)
  assert.deepEqual(JSON.parse(options.body).messages, [...history.slice(-2), latest])
})

test('rejects a blank or oversized current question without sending it', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch')
  for (const content of ['   ', 'a'.repeat(4_001)]) {
    await assert.rejects(getConciergeReply([{ role: 'user', content }]), /valid chat question/)
  }
  assert.equal(fetch.mock.callCount(), 0)
})
