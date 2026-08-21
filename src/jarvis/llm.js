/**
 * Browser-side client for the local Claude bridge (`server/index.js`).
 *
 * The API key never reaches this file — the bridge holds it. If the bridge is
 * not running, or has no credentials, `isAvailable()` stays false and JARVIS
 * runs entirely on its local core.
 */

const DEFAULT_BASE = '/api'

function parseSseChunk(buffer, onEvent) {
  let rest = buffer
  let separator = rest.indexOf('\n\n')
  while (separator !== -1) {
    const raw = rest.slice(0, separator)
    rest = rest.slice(separator + 2)
    const dataLines = raw
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
    if (dataLines.length) {
      try {
        onEvent(JSON.parse(dataLines.join('\n')))
      } catch {
        /* ignore malformed frames rather than killing the stream */
      }
    }
    separator = rest.indexOf('\n\n')
  }
  return rest
}

export function createLlmClient({ baseUrl = DEFAULT_BASE, fetchImpl } = {}) {
  const doFetch = fetchImpl ?? ((...args) => globalThis.fetch(...args))
  let status = { available: false, model: null, reason: 'not checked yet' }
  const listeners = new Set()

  function setStatus(next) {
    status = { ...status, ...next }
    for (const listener of listeners) listener(status)
    return status
  }

  return {
    get status() { return status },
    get model() { return status.model },
    isAvailable: () => status.available,

    subscribe(listener) {
      listeners.add(listener)
      listener(status)
      return () => listeners.delete(listener)
    },

    /** Ask the bridge whether it can reach Claude. Never throws. */
    async refresh() {
      // Opened straight off disk: there is no origin to proxy /api, and the
      // attempt would only spray CORS errors into the console.
      if (typeof location !== 'undefined' && location.protocol === 'file:') {
        return setStatus({ available: false, model: null, reason: 'no bridge (opened as a local file)' })
      }
      try {
        const response = await doFetch(`${baseUrl}/status`, { headers: { accept: 'application/json' } })
        // A 404/500 here means nothing is listening on /api — same practical
        // situation as no bridge at all, so report it the same way.
        if (!response.ok) return setStatus({ available: false, model: null, reason: 'bridge not running' })
        const body = await response.json()
        return setStatus({
          available: Boolean(body.llm),
          model: body.model ?? null,
          reason: body.reason ?? (body.llm ? 'ready' : 'no credentials'),
        })
      } catch {
        return setStatus({ available: false, model: null, reason: 'bridge not running' })
      }
    },

    /**
     * Send one question plus prior turns and stream the answer back.
     * @returns {Promise<string>} the complete reply text
     */
    async ask({ question, history = [], onDelta, signal }) {
      const messages = [
        ...history.map((turn) => ({ role: turn.role, content: turn.content })),
        { role: 'user', content: question },
      ]

      const response = await doFetch(`${baseUrl}/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
        body: JSON.stringify({ messages }),
        signal,
      })

      if (!response.ok) {
        let detail = `bridge returned ${response.status}`
        try {
          const body = await response.json()
          if (body?.error) detail = body.error
        } catch { /* keep the status-code message */ }
        setStatus({ available: response.status !== 503, reason: detail })
        throw new Error(detail)
      }

      // Non-streaming bridges (or proxies that buffer) still return JSON.
      const contentType = response.headers.get('content-type') ?? ''
      if (!contentType.includes('text/event-stream') || !response.body) {
        const body = await response.json()
        if (body.error) throw new Error(body.error)
        onDelta?.(body.text ?? '')
        return body.text ?? ''
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let text = ''
      let failure = null

      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        buffer = parseSseChunk(buffer, (event) => {
          if (event.type === 'delta' && event.text) {
            text += event.text
            onDelta?.(event.text)
          } else if (event.type === 'error') {
            failure = new Error(event.message ?? 'stream error')
          } else if (event.type === 'done' && typeof event.text === 'string' && !text) {
            text = event.text
            onDelta?.(event.text)
          }
        })
      }

      if (failure) throw failure
      return text
    },
  }
}
