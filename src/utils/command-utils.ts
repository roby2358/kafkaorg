/**
 * Command Utilities
 *
 * Shared utilities for parsing and processing commands from LLM responses.
 */

import { parse, SyntaxError } from '../bash/index.js';

/**
 * Extract # Run blocks from LLM response
 */
export function extractRunBlocks(response: string): string[] {
  const commands: string[] = [];
  const runBlockRegex = /#\s*Run\s*\n```(?:bash)?\s*\n([\s\S]*?)```/g;
  let match;

  while ((match = runBlockRegex.exec(response)) !== null) {
    const command = match[1].trim();
    if (command) {
      commands.push(command);
    }
  }

  return commands;
}

/**
 * Remove # Run blocks from response (for clean user-facing output)
 */
export function removeRunBlocks(response: string): string {
  return response.replace(/#\s*Run\s*\n```(?:bash)?\s*\n[\s\S]*?```/g, '').trim();
}

/**
 * Parse a command string into arguments using bash-like parser
 */
export function parseCommand(command: string): string[] {
  try {
    return parse(command);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Syntax error parsing command: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Check if command is a docmem command
 */
export function isDocmemCommand(command: string): boolean {
  return command.startsWith('docmem-') || command === 'hello-world';
}

/**
 * Check if command is a start-conversation command
 */
export function isStartConversationCommand(args: string[]): boolean {
  return args.length > 0 && args[0] === 'start-conversation';
}
