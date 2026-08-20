import { system } from './system.js'
import { timers } from './timers.js'
import { notes } from './notes.js'
import { clock } from './clock.js'
import { converter } from './converter.js'
import { calculator } from './calculator.js'
import { fun } from './fun.js'
import { identity } from './identity.js'

/**
 * Resolution order matters: narrow, imperative skills are tried before the
 * broad conversational ones so that "set a timer for 5" never reaches the
 * arithmetic parser.
 */
export const skills = [system, timers, notes, clock, converter, calculator, fun, identity]

export { system, timers, notes, clock, converter, calculator, fun, identity }
