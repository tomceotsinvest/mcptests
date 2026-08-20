import { choose } from '../text.js'

const GREETINGS = [
  'Good to see you back online, sir.',
  'At your service.',
  'Systems nominal. How may I help?',
]

const THANKS = [
  'Always a pleasure, sir.',
  'Think nothing of it.',
  'That is what I am here for.',
]

const HOW_ARE_YOU = [
  'All systems operating within normal parameters.',
  'Running at optimal efficiency, thank you for asking.',
]

export const identity = {
  id: 'identity',
  title: 'Identity & help',
  help: [
    { command: 'help', description: 'list everything I can do locally' },
    { command: 'who are you', description: 'introductions' },
  ],

  match(ctx) {
    const { text } = ctx

    if (/^(?:hello|hi|hey|good (?:morning|afternoon|evening)|greetings|yo)\b/.test(text)) {
      return { text: choose(GREETINGS, ctx.random) }
    }

    if (/^(?:thanks|thank you|cheers|nice one|much appreciated)\b/.test(text)) {
      return { text: choose(THANKS, ctx.random) }
    }

    if (/^(?:how are you|how're you|you (?:doing )?ok|how do you feel)\b/.test(text)) {
      return { text: choose(HOW_ARE_YOU, ctx.random) }
    }

    if (/^(?:goodbye|bye|good night|see you|later)\b/.test(text)) {
      return { text: 'Standing by. Call for me whenever you need, sir.' }
    }

    if (/(?:who are you|what are you|your name|introduce yourself)/.test(text)) {
      return {
        text: [
          'I am JARVIS — Just A Rather Very Intelligent System.',
          'My local core handles time, arithmetic, conversions, timers and notes without any network at all.',
          ctx.llmAvailable
            ? 'For everything else I am linked to Claude.'
            : 'Connect the Claude link and I can reason about anything else you throw at me.',
        ].join(' '),
      }
    }

    if (/^(?:help|what can you do|what do you do|commands|show commands|options)\b/.test(text)) {
      const lines = ctx.help.map((entry) => `• ${entry.command} — ${entry.description}`)
      return {
        text: `Here is my local command set, sir:\n${lines.join('\n')}`,
        speak: 'Here is my local command set, sir. It is listed on the display.',
      }
    }

    return null
  },
}
