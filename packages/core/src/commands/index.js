/**
 * Registers the core model commands on a command bus.
 */
import { projectCommands } from './project.js'
import { nodeCommands } from './node.js'
import { edgeCommands } from './edge.js'
import { viewCommands } from './view.js'
import { recursionCommands } from './recursion.js'

export const CORE_COMMANDS = Object.freeze({
  ...projectCommands,
  ...nodeCommands,
  ...edgeCommands,
  ...viewCommands,
  ...recursionCommands
})

/** @param {import('../bus.js').CommandBus} bus */
export function registerCoreCommands (bus) {
  for (const [type, { handler, ...meta }] of Object.entries(CORE_COMMANDS)) bus.register(type, handler, meta)
}
