/**
 * Pure helpers for the JARVIS Claude bridge — no sockets, no side effects,
 * so they can be unit-tested without starting a server.
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export const config = {
  port: Number(process.env.JARVIS_PORT ?? 8787),
  host: process.env.JARVIS_HOST ?? '127.0.0.1',
  model: process.env.JARVIS_MODEL ?? 'claude-opus-5',
  // Deliberately small: every reply is spoken aloud, so JARVIS answers briefly.
  maxTokens: Number(process.env.JARVIS_MAX_TOKENS ?? 2048),
  effort: process.env.JARVIS_EFFORT ?? 'low',
  fallbacksEnabled: process.env.JARVIS_FALLBACKS !== 'off',
}

export const FALLBACK_BETA = 'server-side-fallback-2026-07-01'

export const MAX_MESSAGES = 40
export const MAX_CHARS = 8000

export const SYSTEM_PROMPT = `You are JARVIS, the AI majordomo from a certain billionaire's workshop: unflappable, precise, dry-witted, and never sycophantic.

Rules:
- Answers are spoken aloud, so keep them short — two or three sentences unless asked for detail.
- Plain prose. No markdown headings, no bullet lists, no emoji, no stage directions.
- Address the user as "sir" occasionally, not in every reply.
- If you do not know something, say so plainly rather than inventing it.
- Arithmetic, unit conversions, timers, notes and the clock are handled locally before anything reaches you; if one arrives anyway, just answer it.`

/**
 * The SDK resolves credentials from several places, so an unset
 * ANTHROPIC_API_KEY does not mean "no credentials".
 */
export function detectCredentials(env = process.env, homedir = os.homedir()) {
  if (env.ANTHROPIC_API_KEY) return { ok: true, reason: 'ANTHROPIC_API_KEY' }
  if (env.ANTHROPIC_AUTH_TOKEN) return { ok: true, reason: 'ANTHROPIC_AUTH_TOKEN' }
  if (fs.existsSync(path.join(homedir, '.config', 'anthropic'))) {
    return { ok: true, reason: 'ant auth profile' }
  }
  return { ok: false, reason: 'no ANTHROPIC_API_KEY and no `ant auth login` profile' }
}

/**
 * Only local pages may use this bridge. Without this check any website the
 * user visits could POST to localhost:8787 and spend their credits.
 */
export function isOriginAllowed(origin) {
  if (!origin) return true // curl and same-origin requests that send no Origin
  try {
    const { hostname } = new URL(origin)
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname)
  } catch {
    return false
  }
}

/** Validate and clamp the conversation coming from the browser. */
export function sanitizeMessages(raw) {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('messages must be a non-empty array')
  const messages = raw
    .filter((message) => message && (message.role === 'user' || message.role === 'assistant'))
    .map((message) => ({
      role: message.role,
      content: String(message.content ?? '').slice(0, MAX_CHARS),
    }))
    .filter((message) => message.content.trim().length > 0)
    .slice(-MAX_MESSAGES)

  // The Messages API requires the conversation to start with a user turn.
  while (messages.length && messages[0].role !== 'user') messages.shift()
  if (!messages.length) throw new Error('no usable user message')
  if (messages.at(-1).role !== 'user') throw new Error('the last message must come from the user')
  return messages
}

/** Assemble the Messages API request body. */
export function buildRequest(messages, { withFallbacks = false } = {}) {
  const request = {
    model: config.model,
    max_tokens: config.maxTokens,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    output_config: { effort: config.effort },
    messages,
  }
  if (withFallbacks) {
    // Server-side refusal fallback: if a safety classifier declines, the API
    // re-runs the same request on a fallback model inside the same call.
    request.betas = [FALLBACK_BETA]
    request.fallbacks = 'default'
  }
  return request
}
