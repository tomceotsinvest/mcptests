#!/usr/bin/env node
/**
 * JARVIS Claude bridge.
 *
 * A tiny HTTP service that keeps the Anthropic credential on the server side
 * and streams Claude's replies to the browser over SSE. The React app talks
 * to it through Vite's `/api` proxy, so the key is never shipped to the
 * client and never appears in a bundle.
 *
 *   GET  /api/status -> { ok, llm, model, reason }
 *   POST /api/chat   -> text/event-stream of { type: 'delta' | 'done' | 'error' }
 *
 * Run it with `npm run server`, or `npm start` for the bridge plus the web UI.
 */

import http from 'node:http'
import Anthropic from '@anthropic-ai/sdk'
import { buildRequest, config, detectCredentials, isOriginAllowed, sanitizeMessages } from './lib.js'

let client = null
function getClient() {
  if (!client) client = new Anthropic()
  return client
}

function sendJson(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
    ...extraHeaders,
  })
  res.end(payload)
}

async function readJsonBody(req, limit = 256 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new Error('request body too large')
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function isUnsupportedFallback(error) {
  if (!(error instanceof Anthropic.BadRequestError)) return false
  const message = String(error?.message ?? '').toLowerCase()
  return message.includes('fallback') || message.includes('beta')
}

function describeError(error) {
  if (error instanceof Anthropic.AuthenticationError) return 'authentication failed — check ANTHROPIC_API_KEY'
  if (error instanceof Anthropic.RateLimitError) return 'rate limited — try again shortly'
  if (error instanceof Anthropic.NotFoundError) return `model ${config.model} is not available to this credential`
  if (error instanceof Anthropic.APIConnectionError) return 'could not reach the Anthropic API'
  if (error instanceof Anthropic.APIError) return `Anthropic API error ${error.status}: ${error.message}`
  return error?.message ?? 'unknown error'
}

/**
 * Stream one completion. `withFallbacks` uses the beta endpoint so a safety
 * refusal is re-run on a fallback model inside the same call.
 */
async function runStream(messages, { withFallbacks, onDelta, signal }) {
  const request = buildRequest(messages, { withFallbacks })
  const stream = withFallbacks
    ? getClient().beta.messages.stream(request, { signal })
    : getClient().messages.stream(request, { signal })

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      onDelta(event.delta.text)
    }
  }
  return stream.finalMessage()
}

async function handleChat(req, res) {
  let messages
  try {
    const body = await readJsonBody(req)
    messages = sanitizeMessages(body.messages)
  } catch (error) {
    sendJson(res, 400, { error: error.message })
    return
  }

  const credentials = detectCredentials()
  if (!credentials.ok) {
    sendJson(res, 503, { error: `Claude link unavailable: ${credentials.reason}` })
    return
  }

  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-store, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  })

  const send = (event) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`)
  }

  const abort = new AbortController()
  req.on('close', () => abort.abort())

  let text = ''
  const onDelta = (delta) => {
    text += delta
    send({ type: 'delta', text: delta })
  }

  try {
    let final
    try {
      final = await runStream(messages, {
        withFallbacks: config.fallbacksEnabled,
        onDelta,
        signal: abort.signal,
      })
    } catch (error) {
      // Some deployments reject the refusal-fallback beta. Retry once without
      // it, but only while nothing has been streamed to the client yet.
      const retryable =
        config.fallbacksEnabled && !text && !abort.signal.aborted && isUnsupportedFallback(error)
      if (!retryable) throw error
      console.warn('[jarvis] refusal fallbacks unavailable, retrying without them:', error.message)
      final = await runStream(messages, { withFallbacks: false, onDelta, signal: abort.signal })
    }

    if (final.stop_reason === 'refusal') {
      send({ type: 'error', message: `Declined: ${final.stop_details?.explanation ?? 'safety refusal'}` })
    } else {
      send({ type: 'done', text, model: final.model, usage: final.usage })
    }
  } catch (error) {
    if (!abort.signal.aborted) {
      console.error('[jarvis] chat failed:', error)
      send({ type: 'error', message: describeError(error) })
    }
  } finally {
    if (!res.writableEnded) res.end()
  }
}

export const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  const origin = req.headers.origin

  if (!isOriginAllowed(origin)) {
    sendJson(res, 403, { error: 'this bridge only serves local pages' })
    return
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': origin ?? '*',
      'access-control-allow-headers': 'content-type, accept',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-max-age': '600',
    })
    res.end()
    return
  }

  const cors = origin ? { 'access-control-allow-origin': origin } : {}

  if (req.method === 'GET' && url.pathname === '/api/status') {
    const credentials = detectCredentials()
    sendJson(res, 200, {
      ok: true,
      llm: credentials.ok,
      model: credentials.ok ? config.model : null,
      reason: credentials.ok ? `ready via ${credentials.reason}` : credentials.reason,
    }, cors)
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/chat') {
    for (const [key, value] of Object.entries(cors)) res.setHeader(key, value)
    handleChat(req, res)
    return
  }

  if (req.method === 'GET' && url.pathname === '/') {
    sendJson(res, 200, { ok: true, service: 'jarvis-bridge', endpoints: ['/api/status', '/api/chat'] }, cors)
    return
  }

  sendJson(res, 404, { error: 'not found' }, cors)
})

server.listen(config.port, config.host, () => {
  const credentials = detectCredentials()
  console.log(`[jarvis] bridge listening on http://${config.host}:${config.port}`)
  console.log(`[jarvis] model: ${config.model} (effort: ${config.effort}, max_tokens: ${config.maxTokens})`)
  console.log(
    credentials.ok
      ? `[jarvis] credentials: ${credentials.reason}`
      : `[jarvis] no credentials — the UI stays on its local core (${credentials.reason})`,
  )
})
