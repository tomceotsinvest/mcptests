import { ordinal, plural } from '../text.js'

const REMEMBER = [
  /^(?:remember|note|memorise|memorize)\s+(?:that\s+|this[:,]?\s+)?(.+)$/,
  /^(?:make|take|add|write)\s+(?:a\s+)?note[:,]?\s*(?:that\s+)?(.+)$/,
  /^note to self[:,]?\s*(.+)$/,
  /^don't let me forget\s+(?:to\s+)?(.+)$/,
]

export const notes = {
  id: 'notes',
  title: 'Notes',
  help: [
    { command: 'remember that the hangar code is 1701', description: 'store a note' },
    { command: 'what do you remember / forget note 2', description: 'read or delete notes' },
  ],

  match(ctx) {
    const { text, input, memory } = ctx

    if (/^(?:forget everything|forget it all|clear (?:my |all )?notes|wipe (?:your )?notes)$/.test(text)) {
      const count = memory.clearNotes()
      return count
        ? { text: `Forgotten. ${plural(count, 'note')} erased.` }
        : { text: 'There was nothing to forget, sir.' }
    }

    const forgetNumbered = /^forget\s+(?:the\s+)?note\s+(?:number\s+)?(\d+)$/.exec(text)
    if (forgetNumbered) {
      const removed = memory.removeNoteAt(Number(forgetNumbered[1]))
      return removed
        ? { text: `Forgotten: "${removed.text}".` }
        : { text: `There is no ${ordinal(Number(forgetNumbered[1]))} note, sir.` }
    }

    const forgetMatching = /^forget\s+(?:about\s+|the\s+note\s+about\s+)?(.+)$/.exec(text)
    if (forgetMatching) {
      const removed = memory.removeNoteMatching(forgetMatching[1])
      return removed
        ? { text: `Forgotten: "${removed.text}".` }
        : { text: `I have no note about "${forgetMatching[1]}", sir.` }
    }

    if (/^(?:what do you remember|read (?:me )?(?:my|the) notes|list (?:my )?notes|show (?:my )?notes|my notes|notes)$/.test(text)) {
      const stored = memory.getState().notes
      if (!stored.length) return { text: 'I am holding no notes for you, sir.' }
      const lines = stored.map((note, index) => `${index + 1}. ${note.text}`)
      return {
        text: `${plural(stored.length, 'note')} on file:\n${lines.join('\n')}`,
        speak: `${plural(stored.length, 'note')} on file. ${stored.map((note) => note.text).join('. ')}.`,
      }
    }

    for (const pattern of REMEMBER) {
      const match = pattern.exec(text)
      if (!match) continue
      // Store the original casing rather than the lower-cased match.
      const start = input.toLowerCase().indexOf(match[1])
      const content = start === -1 ? match[1] : input.slice(start, start + match[1].length)
      const note = memory.addNote(content)
      return { text: `Noted: "${note.text}".`, data: { note } }
    }

    return null
  },
}
