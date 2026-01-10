/**
 * Interpreter - Processes LLM responses and executes commands from # Run blocks
 */

import { parse, SyntaxError } from './bash/index.js';
import { DocmemCommands, CommandResult } from './docmem/docmem_commands.js';
import { SystemCommands } from './docmem/system_commands.js';
import { Docmem } from './docmem/docmem.js';

export interface ExecutionResult {
  command: string;
  success: boolean;
  result: string;
  error?: string;
}

/**
 * Extract commands from # Run blocks in LLM response
 */
export function extractRunBlocks(response: string): string[] {
  const commands: string[] = [];
  
  // Match # Run followed by ```bash or ``` (code block)
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
 * Parse a command string into arguments
 */
function parseCommand(command: string): string[] {
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
 * Execute a command and return the result
 */
async function executeCommand(
  args: string[],
  systemCommands: SystemCommands,
  docmemCommands: DocmemCommands | null
): Promise<CommandResult> {
  if (args.length === 0) {
    throw new Error('Empty command');
  }

  const command = args[0];

  // System commands
  if (command === 'hello-world') {
    return systemCommands.helloWorld();
  }

  // Docmem commands that don't require an active instance
  if (command === 'docmem-get-all-roots') {
    const roots = await Docmem.getAllRoots();
    return { success: true, result: `docmem-get-all-roots:\n${JSON.stringify(roots.map(r => r.toDict()), null, 2)}` };
  }

  if (command === 'docmem-create') {
    if (args.length < 2) {
      throw new Error('docmem-create requires a root-id argument');
    }
    const validatedRootId = args[1].trim();
    const newDocmem = new Docmem(validatedRootId);
    await newDocmem.ready();
    return { success: true, result: `docmem-create created docmem: ${validatedRootId}` };
  }

  // Docmem commands that require an active instance
  if (!docmemCommands) {
    throw new Error(`Command ${command} requires a docmem instance. Use docmem-create to create one first.`);
  }

  if (command === 'docmem-create-node') {
    if (args.length < 7) {
      throw new Error('docmem-create-node requires mode, node-id, context-type, context-name, context-value, and content arguments');
    }
    return await docmemCommands.createNode(args[1], args[2], args[3], args[4], args[5], args[6]);
  }

  if (command === 'docmem-update-content') {
    if (args.length < 3) {
      throw new Error('docmem-update-content requires node-id and content arguments');
    }
    return await docmemCommands.updateContent(args[1], args[2]);
  }

  if (command === 'docmem-update-context') {
    if (args.length < 5) {
      throw new Error('docmem-update-context requires node-id, context-type, context-name, and context-value arguments');
    }
    return await docmemCommands.updateContext(args[1], args[2], args[3], args[4]);
  }

  if (command === 'docmem-move-node') {
    if (args.length < 4) {
      throw new Error('docmem-move-node requires mode, node-id, and target-id arguments');
    }
    return await docmemCommands.moveNode(args[1], args[2], args[3]);
  }

  if (command === 'docmem-copy-node') {
    if (args.length < 4) {
      throw new Error('docmem-copy-node requires mode, node-id, and target-id arguments');
    }
    return await docmemCommands.copyNode(args[1], args[2], args[3]);
  }

  if (command === 'docmem-delete') {
    if (args.length < 2) {
      throw new Error('docmem-delete requires a node-id argument');
    }
    return await docmemCommands.delete(args[1]);
  }

  if (command === 'docmem-find') {
    if (args.length < 2) {
      throw new Error('docmem-find requires a node-id argument');
    }
    return await docmemCommands.find(args[1]);
  }

  if (command === 'docmem-serialize') {
    if (args.length < 2) {
      throw new Error('docmem-serialize requires a node-id argument');
    }
    return await docmemCommands.serialize(args[1]);
  }

  if (command === 'docmem-structure') {
    if (args.length < 2) {
      throw new Error('docmem-structure requires a node-id argument');
    }
    return await docmemCommands.structure(args[1]);
  }

  if (command === 'docmem-expand-to-length') {
    if (args.length < 3) {
      throw new Error('docmem-expand-to-length requires node-id and maxTokens arguments');
    }
    return await docmemCommands.expandToLength(args[1], args[2]);
  }

  if (command === 'docmem-add-summary') {
    if (args.length < 7) {
      throw new Error('docmem-add-summary requires context-type, context-name, context-value, content, start-node-id, and end-node-id arguments');
    }
    return await docmemCommands.addSummary(args[1], args[2], args[3], args[4], args[5], args[6]);
  }

  throw new Error(`Unknown command: ${command}`);
}

/**
 * Format execution results as a string
 */
export function formatExecutionResults(executionResults: ExecutionResult[]): string {
  if (executionResults.length === 0) {
    return '';
  }

  let formatted = '## Command Execution Results\n\n';
  for (const execResult of executionResults) {
    if (execResult.success) {
      formatted += `\`\`\`\nresult> ${execResult.result}\n\`\`\`\n\n`;
    } else {
      formatted += `\`\`\`\nerror> ${execResult.error || execResult.result}\n\`\`\`\n\n`;
    }
  }
  return formatted;
}

/**
 * Process LLM response: extract commands, execute them, and return results
 * Returns the original response, execution results, and updated docmemId
 */
export async function processResponse(
  response: string,
  docmemId: string | null
): Promise<{ originalResponse: string; executionResults: ExecutionResult[]; docmemId: string | null }> {
  const commands = extractRunBlocks(response);
  const executionResults: ExecutionResult[] = [];
  
  if (commands.length === 0) {
    return { originalResponse: response, executionResults: [], docmemId };
  }

  const systemCommands = new SystemCommands();
  let currentDocmemId = docmemId;
  let docmemCommands: DocmemCommands | null = null;
  
  if (currentDocmemId) {
    const docmem = new Docmem(currentDocmemId);
    await docmem.ready();
    docmemCommands = new DocmemCommands(docmem);
  }

  for (const commandStr of commands) {
    try {
      const args = parseCommand(commandStr);
      const result = await executeCommand(args, systemCommands, docmemCommands);
      
      executionResults.push({
        command: commandStr,
        success: result.success,
        result: result.result,
      });

      // If docmem-create was executed, set the docmemId for future commands
      if (args[0] === 'docmem-create' && result.success) {
        currentDocmemId = args[1];
        const docmem = new Docmem(currentDocmemId);
        await docmem.ready();
        docmemCommands = new DocmemCommands(docmem);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      executionResults.push({
        command: commandStr,
        success: false,
        result: '',
        error: errorMessage,
      });
    }
  }

  return { originalResponse: response, executionResults, docmemId: currentDocmemId };
}
