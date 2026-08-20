/**
 * A small recursive-descent arithmetic evaluator.
 *
 * Deliberately NOT `eval` / `new Function`: user speech goes straight into
 * this parser, so it only ever understands numbers, the operators below and
 * a fixed function table. Anything else returns null and the caller falls
 * through to the next skill (or to Claude).
 *
 * Grammar:
 *   expr    := term (('+' | '-') term)*
 *   term    := unary (('*' | '/' | '%') unary)*
 *   unary   := ('-' | '+') unary | power
 *   power   := primary ('^' unary)?          // right associative
 *   primary := number | constant | func '(' expr ')' | '(' expr ')'
 */

const FUNCTIONS = {
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  abs: Math.abs,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  ln: Math.log,
  log: Math.log10,
  log2: Math.log2,
  exp: Math.exp,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
}

const CONSTANTS = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 }

const WORD_OPERATORS = [
  [/\bto the power of\b/g, '^'],
  [/\bmultiplied by\b/g, '*'],
  [/\bdivided by\b/g, '/'],
  [/\bmodulo\b/g, '%'],
  [/\bmod\b/g, '%'],
  [/\bplus\b/g, '+'],
  [/\bminus\b/g, '-'],
  [/\btimes\b/g, '*'],
  [/\bover\b/g, '/'],
]

/** Turn spoken arithmetic into symbolic arithmetic. */
export function normalizeExpression(input) {
  let text = String(input ?? '').toLowerCase().trim()
  text = text.replace(/^(?:what(?:'s| is)|whats|how much is|calculate|compute|solve|evaluate|work out)\s+/, '')
  text = text.replace(/[?]+$/, '')
  text = text.replace(/(\d),(?=\d{3}\b)/g, '$1') // 1,234 -> 1234
  text = text.replace(/[×✕]/g, '*').replace(/[÷]/g, '/').replace(/[−–—]/g, '-')
  for (const [pattern, replacement] of WORD_OPERATORS) text = text.replace(pattern, replacement)
  text = text.replace(/(\d)\s*[x]\s*(?=[\d(])/g, '$1*') // 3 x 4 -> 3*4
  text = text.replace(/\s*\bsquared\b/g, '^2').replace(/\s*\bcubed\b/g, '^3')
  text = text.replace(/\bsquare root of\b/g, 'sqrt').replace(/\bcube root of\b/g, 'cbrt')
  return text.replace(/\s+/g, ' ').trim()
}

function tokenize(source) {
  const tokens = []
  let i = 0
  while (i < source.length) {
    const char = source[i]
    if (char === ' ') { i += 1; continue }
    if (/[0-9.]/.test(char)) {
      const match = /^\d*\.?\d+(?:e[+-]?\d+)?/.exec(source.slice(i))
      if (!match) return null
      tokens.push({ type: 'number', value: Number(match[0]) })
      i += match[0].length
      continue
    }
    if (/[a-z]/.test(char)) {
      const match = /^[a-z][a-z0-9]*/.exec(source.slice(i))
      tokens.push({ type: 'name', value: match[0] })
      i += match[0].length
      continue
    }
    if ('+-*/%^()'.includes(char)) {
      tokens.push({ type: char })
      i += 1
      continue
    }
    return null // unknown character: not an arithmetic expression
  }
  return tokens
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens
    this.pos = 0
  }

  peek() { return this.tokens[this.pos] }

  eat(type) {
    if (this.peek()?.type === type) return this.tokens[this.pos++]
    return null
  }

  expect(type) {
    const token = this.eat(type)
    if (!token) throw new SyntaxError(`expected ${type}`)
    return token
  }

  parseExpression() {
    let left = this.parseTerm()
    for (;;) {
      if (this.eat('+')) left += this.parseTerm()
      else if (this.eat('-')) left -= this.parseTerm()
      else return left
    }
  }

  parseTerm() {
    let left = this.parseUnary()
    for (;;) {
      if (this.eat('*')) left *= this.parseUnary()
      else if (this.eat('/')) left /= this.parseUnary()
      else if (this.eat('%')) left %= this.parseUnary()
      else return left
    }
  }

  parseUnary() {
    if (this.eat('-')) return -this.parseUnary()
    if (this.eat('+')) return this.parseUnary()
    return this.parsePower()
  }

  parsePower() {
    const base = this.parsePrimary()
    if (this.eat('^')) return base ** this.parseUnary()
    return base
  }

  parsePrimary() {
    const token = this.peek()
    if (!token) throw new SyntaxError('unexpected end of expression')
    if (token.type === 'number') { this.pos += 1; return token.value }
    if (token.type === '(') {
      this.pos += 1
      const value = this.parseExpression()
      this.expect(')')
      return value
    }
    if (token.type === 'name') {
      this.pos += 1
      const name = token.value
      if (Object.hasOwn(CONSTANTS, name)) return CONSTANTS[name]
      const fn = FUNCTIONS[name]
      if (!fn) throw new SyntaxError(`unknown name ${name}`)
      // Parentheses are optional: "sqrt 16" and "sqrt(16)" both work.
      if (this.eat('(')) {
        const value = this.parseExpression()
        this.expect(')')
        return fn(value)
      }
      return fn(this.parseUnary())
    }
    throw new SyntaxError(`unexpected token ${token.type}`)
  }
}

/**
 * Evaluate an arithmetic expression.
 * @returns {number|null} null when the input is not valid arithmetic.
 */
export function evaluate(expression) {
  const source = normalizeExpression(expression)
  if (!source) return null
  if (!/\d/.test(source) && !/\b(?:pi|tau)\b/.test(source)) return null
  const tokens = tokenize(source)
  if (!tokens || !tokens.length) return null
  try {
    const parser = new Parser(tokens)
    const value = parser.parseExpression()
    if (parser.pos !== tokens.length) return null // trailing junk
    return Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

/** Format a result for speech: trims float noise, adds thousands separators. */
export function formatNumber(value, maxDecimals = 6) {
  if (!Number.isFinite(value)) return String(value)
  const rounded = Number(value.toFixed(maxDecimals))
  const [whole, decimals] = String(Math.abs(rounded)).split('.')
  if (Math.abs(rounded) >= 1e15 || (rounded !== 0 && Math.abs(rounded) < 1e-6)) {
    return rounded.toExponential(4)
  }
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const sign = rounded < 0 ? '-' : ''
  return decimals ? `${sign}${grouped}.${decimals}` : `${sign}${grouped}`
}
