/**
 * Command Executor
 *
 * Executes tool commands (docmem, system, etc.)
 * Can be used by agents or the interpreter.
 */

import { DocmemCommands, CommandResult } from '../docmem_tools/docmem_tools.js';
import { SystemCommands } from '../system_tools/system_tools.js';
import { Docmem } from '../docmem_tools/docmem.js';

export interface CommandExecutorOptions {
  docmemId?: string | null;
}

/**
 * Execute a command and return the result
 */
export class CommandExecutor {
  private docmemId: string | null = null;
  private docmemCommands: DocmemCommands | null = null;
  private systemCommands: SystemCommands = new SystemCommands();

  constructor(options?: CommandExecutorOptions) {
    if (options?.docmemId) {
      this.docmemId = options.docmemId;
    }
  }

  /**
   * Execute a command
   */
  async execute(args: string[]): Promise<CommandResult> {
    if (args.length === 0) {
      throw new Error('Empty command');
    }

    const command = args[0];

    // System commands
    if (command === 'hello-world') {
      return this.systemCommands.helloWorld();
    }

    // Docmem commands that don't require an active instance
    if (command === 'docmem-get-all-roots') {
      return await this.getAllRoots();
    }

    if (command === 'docmem-create') {
      return await this.createDocmem(args);
    }

    // Docmem commands that require an active instance
    if (!this.docmemCommands) {
      throw new Error(
        `Command ${command} requires a docmem instance. Use docmem-create first.`
      );
    }

    return await this.executeDocmemCommand(command, args);
  }

  /**
   * Get current docmem ID
   */
  getDocmemId(): string | null {
    return this.docmemId;
  }

  /**
   * Get all docmem roots
   */
  private async getAllRoots(): Promise<CommandResult> {
    const roots = await Docmem.getAllRoots();
    return {
      success: true,
      result: `docmem-get-all-roots:\n${JSON.stringify(
        roots.map((r) => r.toDict()),
        null,
        2
      )}`,
    };
  }

  /**
   * Create a new docmem instance
   */
  private async createDocmem(args: string[]): Promise<CommandResult> {
    if (args.length < 2) {
      throw new Error('docmem-create requires a root-id argument');
    }

    const rootId = args[1].trim();
    const newDocmem = new Docmem(rootId);
    await newDocmem.ready();

    this.docmemId = rootId;
    this.docmemCommands = new DocmemCommands(newDocmem);

    return {
      success: true,
      result: `docmem-create created docmem: ${rootId}`,
    };
  }

  /**
   * Execute docmem instance commands
   */
  private async executeDocmemCommand(
    command: string,
    args: string[]
  ): Promise<CommandResult> {
    if (!this.docmemCommands) {
      throw new Error('Docmem commands instance not initialized');
    }

    switch (command) {
      case 'docmem-create-node':
        if (args.length < 7) {
          throw new Error(
            'docmem-create-node requires mode, node-id, context-type, context-name, context-value, and content'
          );
        }
        return await this.docmemCommands.createNode(
          args[1],
          args[2],
          args[3],
          args[4],
          args[5],
          args[6]
        );

      case 'docmem-update-content':
        if (args.length < 3) {
          throw new Error('docmem-update-content requires node-id and content');
        }
        return await this.docmemCommands.updateContent(args[1], args[2]);

      case 'docmem-update-context':
        if (args.length < 5) {
          throw new Error(
            'docmem-update-context requires node-id, context-type, context-name, and context-value'
          );
        }
        return await this.docmemCommands.updateContext(
          args[1],
          args[2],
          args[3],
          args[4]
        );

      case 'docmem-move-node':
        if (args.length < 4) {
          throw new Error(
            'docmem-move-node requires mode, node-id, and target-id'
          );
        }
        return await this.docmemCommands.moveNode(args[1], args[2], args[3]);

      case 'docmem-copy-node':
        if (args.length < 4) {
          throw new Error(
            'docmem-copy-node requires mode, node-id, and target-id'
          );
        }
        return await this.docmemCommands.copyNode(args[1], args[2], args[3]);

      case 'docmem-delete':
        if (args.length < 2) {
          throw new Error('docmem-delete requires a node-id');
        }
        return await this.docmemCommands.delete(args[1]);

      case 'docmem-find':
        if (args.length < 2) {
          throw new Error('docmem-find requires a node-id');
        }
        return await this.docmemCommands.find(args[1]);

      case 'docmem-serialize':
        if (args.length < 2) {
          throw new Error('docmem-serialize requires a node-id');
        }
        return await this.docmemCommands.serialize(args[1]);

      case 'docmem-structure':
        if (args.length < 2) {
          throw new Error('docmem-structure requires a node-id');
        }
        return await this.docmemCommands.structure(args[1]);

      case 'docmem-expand-to-length':
        if (args.length < 3) {
          throw new Error(
            'docmem-expand-to-length requires node-id and maxTokens'
          );
        }
        return await this.docmemCommands.expandToLength(args[1], args[2]);

      case 'docmem-add-summary':
        if (args.length < 7) {
          throw new Error(
            'docmem-add-summary requires context-type, context-name, context-value, content, start-node-id, and end-node-id'
          );
        }
        return await this.docmemCommands.addSummary(
          args[1],
          args[2],
          args[3],
          args[4],
          args[5],
          args[6]
        );

      default:
        throw new Error(`Unknown command: ${command}`);
    }
  }
}
