import { formatDuration } from '../duration.js'
import { plural } from '../text.js'

export const system = {
  id: 'system',
  title: 'System control',
  help: [
    { command: 'status', description: 'diagnostics: link state, timers, notes' },
    { command: 'mute / unmute, clear the log', description: 'control the interface' },
  ],

  match(ctx) {
    const { text, memory, now, llmAvailable, llmModel } = ctx

    if (/^(?:clear|reset|wipe)\s+(?:the\s+)?(?:log|screen|display|transcript|history)$/.test(text)) {
      return { text: 'Display cleared.', action: { type: 'clear-transcript' }, silent: true }
    }

    if (/^(?:mute|be quiet|quiet|stop talking|silence|shush)$/.test(text)) {
      memory.setSetting('voice', false)
      return { text: 'Voice output muted, sir.', action: { type: 'stop-speaking' }, silent: true }
    }

    if (/^(?:unmute|speak up|talk to me|voice on|start talking)$/.test(text)) {
      memory.setSetting('voice', true)
      return { text: 'Voice output restored.' }
    }

    if (/^(?:stop|cancel|abort|halt)$/.test(text)) {
      return { text: 'Stopping.', action: { type: 'stop-speaking' }, silent: true }
    }

    if (/^(?:wipe|reset|erase)\s+(?:your\s+)?(?:memory|everything|all data)$/.test(text)) {
      memory.reset()
      return { text: 'Memory banks wiped. Notes and timers are gone, sir.' }
    }

    if (/^(?:status|diagnostics|system status|run diagnostics|report|systems check|sitrep)$/.test(text)) {
      const state = memory.getState()
      const next = state.timers[0]
      const lines = [
        'Diagnostics complete.',
        '• Local core: online',
        `• Claude link: ${llmAvailable ? `active (${llmModel ?? 'unknown model'})` : 'offline'}`,
        `• Notes: ${plural(state.notes.length, 'entry', 'entries')}`,
        `• Timers: ${state.timers.length} running${next ? ` — next in ${formatDuration(next.endsAt - now.getTime())}` : ''}`,
        `• Voice: ${state.settings.voice ? 'enabled' : 'muted'}`,
      ]
      return {
        text: lines.join('\n'),
        speak: `Diagnostics complete. Local core online. Claude link ${llmAvailable ? 'active' : 'offline'}. ${plural(state.notes.length, 'note')} and ${plural(state.timers.length, 'timer')} on file.`,
      }
    }

    return null
  },
}
