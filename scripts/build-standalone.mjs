#!/usr/bin/env node
/**
 * Bundle the built app into ONE self-contained HTML file.
 *
 * Every stylesheet, script and the favicon are inlined, so `dist/jarvis.html`
 * runs from a double-click (file://), a USB stick or any static host with no
 * server, no build step and no network. The Claude bridge is unreachable that
 * way, so the page runs on its local core and says so in the status rail.
 *
 * Usage: npm run build:standalone
 */

import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const dist = path.join(root, 'dist')
const outFile = path.join(dist, 'jarvis.html')

/** Keep inline payloads from terminating their own tag. */
const escapeForTag = (code) => code.replace(/<\/(script|style)/gi, (_, tag) => `<\\/${tag}`)

/**
 * Replace `tag` with `replacement` literally. String.replace treats `$&`,
 * `$'` and friends in the *replacement* as substitution patterns, and a
 * minified bundle is full of them — a replacer function opts out of that.
 */
const swap = (html, tag, replacement) => html.replace(tag, () => replacement)

async function readAsset(href) {
  return fs.readFile(path.join(dist, href.replace(/^\//, '')), 'utf8')
}

async function main() {
  let html
  try {
    html = await fs.readFile(path.join(dist, 'index.html'), 'utf8')
  } catch {
    console.error('dist/index.html is missing — run `npm run build` first.')
    process.exitCode = 1
    return
  }

  // Inline every local stylesheet.
  const styleLinks = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)]
  for (const [tag] of styleLinks) {
    const href = /href="([^"]+)"/.exec(tag)?.[1]
    if (!href || /^https?:/.test(href)) continue
    html = swap(html, tag, `<style>${escapeForTag(await readAsset(href))}</style>`)
  }

  // Inline every local module script.
  const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"[^>]*><\/script>/g)]
  for (const [tag, src] of scripts) {
    if (/^https?:/.test(src)) continue
    const type = /type="module"/.test(tag) ? ' type="module"' : ''
    html = swap(html, tag, `<script${type}>${escapeForTag(await readAsset(src))}</script>`)
  }

  // Inline the favicon as a data URI so the tab icon survives too.
  const icon = /<link[^>]+rel="icon"[^>]*>/.exec(html)?.[0]
  const iconHref = icon && /href="([^"]+)"/.exec(icon)?.[1]
  if (icon && iconHref && !/^data:|^https?:/.test(iconHref)) {
    const svg = await readAsset(iconHref)
    const encoded = Buffer.from(svg, 'utf8').toString('base64')
    html = swap(html, icon, `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,${encoded}" />`)
  }

  await fs.writeFile(outFile, html, 'utf8')
  const { size } = await fs.stat(outFile)
  console.log(`[jarvis] wrote ${path.relative(root, outFile)} (${(size / 1024).toFixed(0)} kB) — open it directly in a browser`)
}

await main()
