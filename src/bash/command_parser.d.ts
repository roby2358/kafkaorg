// Type declarations for the Peggy-generated command parser

export interface SyntaxErrorLocation {
  source: string | undefined;
  start: {
    offset: number;
    line: number;
    column: number;
  };
  end: {
    offset: number;
    line: number;
    column: number;
  };
}

export interface Expectation {
  type: 'literal' | 'class' | 'any' | 'end' | 'other';
  text?: string;
  parts?: (string | [string, string])[];
  inverted?: boolean;
  ignoreCase?: boolean;
  description?: string;
}

export class SyntaxError extends Error {
  expected: Expectation[];
  found: string | null;
  location: SyntaxErrorLocation;
  name: 'SyntaxError';

  format(sources: { source: string; text: string }[]): string;
  static buildMessage(expected: Expectation[], found: string | null): string;
}

export interface ParseOptions {
  grammarSource?: string;
  startRule?: 'command';
}

/**
 * Parse a command string into an array of argument strings.
 * Supports bash-style quoting (single, double, triple backtick) and escaping.
 * 
 * @param input - The command string to parse
 * @param options - Optional parsing options
 * @returns Array of parsed argument strings
 * @throws {SyntaxError} If the input has invalid syntax (e.g., unterminated quotes)
 * 
 * @example
 * parse('command arg1 arg2') // ['command', 'arg1', 'arg2']
 * parse('command "path with spaces"') // ['command', 'path with spaces']
 * parse('command ```multiline\ncontent```') // ['command', 'multiline\ncontent']
 */
export function parse(input: string, options?: ParseOptions): string[];
