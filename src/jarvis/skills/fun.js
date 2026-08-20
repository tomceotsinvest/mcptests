import { choose } from '../text.js'

const JOKES = [
  'I would tell you a UDP joke, but you might not get it.',
  'There are only 10 kinds of people, sir: those who understand binary and those who do not.',
  'I asked the server for a raise. It said it was already running on maximum overhead.',
  'A byte walked into a bar and ordered a nibble.',
]

const COIN = ['Heads.', 'Tails.']

export const fun = {
  id: 'fun',
  title: 'Dice, coins & levity',
  help: [
    { command: 'roll a d20 / roll 2d6', description: 'dice' },
    { command: 'flip a coin, random number 1 to 100', description: 'chance' },
  ],

  match(ctx) {
    const { text, random = Math.random } = ctx

    const dice = /^(?:roll|throw)\s+(?:a|an|some)?\s*(\d*)\s*d\s*(\d+)$/.exec(text)
    if (dice) {
      const count = Math.min(20, Math.max(1, Number(dice[1] || 1)))
      const sides = Math.min(1000, Math.max(2, Number(dice[2])))
      const rolls = Array.from({ length: count }, () => 1 + Math.floor(random() * sides))
      const total = rolls.reduce((sum, roll) => sum + roll, 0)
      return count === 1
        ? { text: `A ${total} on a d${sides}.` }
        : { text: `${rolls.join(' + ')} = ${total} on ${count}d${sides}.` }
    }

    if (/^(?:roll|throw)\s+(?:the\s+)?dice$/.test(text)) {
      const rolls = [1 + Math.floor(random() * 6), 1 + Math.floor(random() * 6)]
      return { text: `${rolls[0]} and ${rolls[1]} — ${rolls[0] + rolls[1]} in total.` }
    }

    if (/^(?:flip|toss)\s+(?:a\s+)?coin$/.test(text) || /^heads or tails$/.test(text)) {
      return { text: choose(COIN, random) }
    }

    const randomRange = /^(?:give me a |pick a |choose a )?random number(?:\s+(?:between|from)\s+(-?\d+)\s+(?:and|to)\s+(-?\d+))?$/.exec(text)
    if (randomRange) {
      const low = randomRange[1] === undefined ? 1 : Number(randomRange[1])
      const high = randomRange[2] === undefined ? 100 : Number(randomRange[2])
      const [min, max] = low <= high ? [low, high] : [high, low]
      return { text: String(min + Math.floor(random() * (max - min + 1))) }
    }

    if (/^(?:tell me a joke|say something funny|make me laugh|joke)$/.test(text)) {
      return { text: choose(JOKES, random) }
    }

    return null
  },
}
