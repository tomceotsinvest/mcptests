/**
 * Voice I/O built on the Web Speech API.
 *
 * Both halves are optional: Chrome and Edge support recognition, everyone
 * supports synthesis, and Firefox supports neither reliably. The UI checks
 * the `*Supported` flags and hides what is unavailable instead of breaking.
 */

const PREFERRED_VOICES = [
  'Google UK English Male',
  'Daniel',
  'Microsoft Ryan Online (Natural) - English (United Kingdom)',
  'Arthur',
  'Oliver',
]

export function createSpeech({ lang = 'en-GB' } = {}) {
  const Recognition =
    typeof window !== 'undefined' ? window.SpeechRecognition ?? window.webkitSpeechRecognition : undefined
  const synthesis = typeof window !== 'undefined' ? window.speechSynthesis : undefined

  let recognition = null
  let cachedVoice = null

  function pickVoice() {
    if (!synthesis) return null
    if (cachedVoice) return cachedVoice
    const voices = synthesis.getVoices()
    if (!voices.length) return null
    cachedVoice =
      PREFERRED_VOICES.map((name) => voices.find((voice) => voice.name === name)).find(Boolean) ??
      voices.find((voice) => voice.lang === lang) ??
      voices.find((voice) => voice.lang?.startsWith('en')) ??
      voices[0]
    return cachedVoice
  }

  // Voices load asynchronously in Chrome; refresh the cache when they arrive.
  if (synthesis && 'onvoiceschanged' in synthesis) {
    synthesis.addEventListener('voiceschanged', () => {
      cachedVoice = null
      pickVoice()
    })
  }

  return {
    recognitionSupported: Boolean(Recognition),
    synthesisSupported: Boolean(synthesis),

    /**
     * Start a single dictation pass.
     * @returns {Function} call it to stop listening early
     */
    listen({ onPartial, onResult, onEnd, onError } = {}) {
      if (!Recognition) {
        onError?.(new Error('speech recognition is not available in this browser'))
        return () => {}
      }
      this.stopListening()

      recognition = new Recognition()
      recognition.lang = lang
      recognition.continuous = false
      recognition.interimResults = true
      recognition.maxAlternatives = 1

      let finalText = ''
      recognition.onresult = (event) => {
        let interim = ''
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i]
          if (result.isFinal) finalText += result[0].transcript
          else interim += result[0].transcript
        }
        if (interim) onPartial?.(interim.trim())
        if (finalText) onPartial?.(finalText.trim())
      }
      recognition.onerror = (event) => {
        if (event.error === 'aborted' || event.error === 'no-speech') return
        onError?.(new Error(event.error ?? 'recognition failed'))
      }
      recognition.onend = () => {
        recognition = null
        const text = finalText.trim()
        if (text) onResult?.(text)
        onEnd?.(text)
      }

      try {
        recognition.start()
      } catch (error) {
        recognition = null
        onError?.(error)
      }
      return () => this.stopListening()
    },

    stopListening() {
      if (!recognition) return
      try {
        recognition.stop()
      } catch {
        /* already stopped */
      }
    },

    /** Speak a line. Strips the markup JARVIS uses on screen. */
    speak(text, { onStart, onEnd } = {}) {
      if (!synthesis || !text) {
        onEnd?.()
        return
      }
      synthesis.cancel()
      const spoken = String(text)
        .replace(/[•*_`#]/g, '')
        .replace(/\s*\n\s*/g, '. ')
        .replace(/\s{2,}/g, ' ')
        .trim()
      if (!spoken) {
        onEnd?.()
        return
      }
      const utterance = new SpeechSynthesisUtterance(spoken)
      const voice = pickVoice()
      if (voice) utterance.voice = voice
      utterance.lang = voice?.lang ?? lang
      utterance.rate = 1.02
      utterance.pitch = 0.9
      utterance.onstart = () => onStart?.()
      utterance.onend = () => onEnd?.()
      utterance.onerror = () => onEnd?.()
      synthesis.speak(utterance)
    },

    cancelSpeech() {
      synthesis?.cancel()
    },
  }
}
