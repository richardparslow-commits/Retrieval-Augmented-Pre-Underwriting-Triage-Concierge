import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readBoundedJson } from '../server/readBoundedJson.ts'
import { handleChatRequest } from '../server/chatRoute.ts'
import { handleWebhookRequest } from '../server/webhookRoute.ts'

test('accepts exact limits and decodes UTF-8 split across chunks', async () => {
  const bytes = new TextEncoder().encode(JSON.stringify('é'))
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes.slice(0, 2))
      controller.enqueue(bytes.slice(2))
      controller.close()
    },
  })
  const request = new Request('https://app.example.test', { method: 'POST', body, duplex: 'half' })
  assert.deepEqual(await readBoundedJson(request, bytes.length), { ok: true, value: 'é' })
})

test('rejects over-limit input early and cancels its stream', async () => {
  let cancelled = false
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(5))
    },
    cancel() {
      cancelled = true
    },
  })
  const request = new Request('https://app.example.test', { method: 'POST', body, duplex: 'half' })
  const result = await readBoundedJson(request, 4)
  assert.equal(result.ok, false)
  assert.equal(result.response.status, 413)
  assert.equal(cancelled, true)
})

test('both routes enforce byte limits and preserve malformed JSON responses', async () => {
  for (const [handler, limit] of [[handleChatRequest, 32_768], [handleWebhookRequest, 16_384]]) {
    const submit = (body) => handler(new Request('https://app.example.test', { method: 'POST', body }))
    assert.equal((await submit(JSON.stringify('é'.repeat(limit / 2)))).status, 413)
    assert.equal((await submit('{')).status, 400)
  }
})
