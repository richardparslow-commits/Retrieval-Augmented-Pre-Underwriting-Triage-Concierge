import assert from 'node:assert/strict'
import { test } from 'node:test'
import { handleChatRequest } from '../server/chatRoute.ts'

function submit(content) {
  return handleChatRequest(new Request('https://app.example.test/api/chat', {
    method: 'POST',
    body: JSON.stringify({ messages: [{ role: 'user', content }] }),
  }))
}

test('rejects blank questions and provider replies, and matches complete search terms', async (t) => {
  const previousKey = process.env.OPENAI_API_KEY
  const previousUrl = process.env.OPENAI_COMPATIBLE_URL
  process.env.OPENAI_API_KEY = 'synthetic'
  process.env.OPENAI_COMPATIBLE_URL = 'https://provider.example.test/chat'
  t.after(() => {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY
    else process.env.OPENAI_API_KEY = previousKey
    if (previousUrl === undefined) delete process.env.OPENAI_COMPATIBLE_URL
    else process.env.OPENAI_COMPATIBLE_URL = previousUrl
  })

  let reply = '   '
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({
    choices: [{ message: { content: reply } }],
  }))

  assert.equal((await submit('   ')).status, 400)
  assert.equal(fetch.mock.callCount(), 0)
  assert.equal((await submit('How is this determined?')).status, 502)
  const unrelatedPrompt = JSON.parse(fetch.mock.calls[0].arguments[1].body).messages[0].content
  assert.match(unrelatedPrompt, /No matching product reference was found/)

  reply = 'Synthetic answer'
  assert.deepEqual(await (await submit('Term-life insurance?')).json(), { reply })
  const termPrompt = JSON.parse(fetch.mock.calls[1].arguments[1].body).messages[0].content
  assert.match(termPrompt, /Term life insurance provides coverage/)
})
