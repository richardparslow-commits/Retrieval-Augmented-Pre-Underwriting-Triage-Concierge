type ReadJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; response: Response }

export async function readBoundedJson(request: Request, maxBytes: number): Promise<ReadJsonResult> {
  const reader = request.body?.getReader()
  const decoder = new TextDecoder()
  let totalBytes = 0
  let text = ''

  try {
    if (reader) {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        totalBytes += chunk.value.byteLength
        if (totalBytes > maxBytes) {
          // A slow cancellation handler must not delay the rejection.
          void reader.cancel().catch(() => {})
          return { ok: false, response: Response.json({ error: 'Payload too large' }, { status: 413 }) }
        }
        text += decoder.decode(chunk.value, { stream: true })
      }
      text += decoder.decode()
    }
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false, response: Response.json({ error: 'Invalid JSON payload' }, { status: 400 }) }
  } finally {
    reader?.releaseLock()
  }
}
