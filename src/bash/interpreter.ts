/**
 * Interpreter - Processes agent responses and executes tools
 */

export interface ParsedResponse {
  speak?: string;
  thought?: string;
  action?: string;
  pass?: boolean;
  vote?: string;
}

export interface HansardEntry {
  speaker: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface ToolResult {
  status: 'success' | 'error';
  message?: string;
  data?: {
    requiresInvocation?: boolean;
    target?: 'all' | number;
    instruction?: string;
  };
}

export interface Session {
  addToHansard(speaker: string, message: string, metadata?: Record<string, unknown>): HansardEntry;
  executeTool(action: string): ToolResult;
  recordVote(memberName: string, vote: string): void;
  state: {
    adjourned: boolean;
  };
}

export interface API {
  parseResponse(response: string): ParsedResponse;
}

export interface UI {
  addHansardEntry(entry: HansardEntry): void;
  addSystemMessage(message: string): void;
  updateAll(session: Session): void;
}

export interface InvokeMembersFunction {
  (instruction: string): Promise<string[]>;
}

export interface InvokeMemberFunction {
  (memberNumber: number, instruction: string): Promise<string>;
}

export class Interpreter {
  private session: Session;
  private api: API;
  private ui: UI;

  constructor(session: Session, api: API, ui: UI) {
    this.session = session;
    this.api = api;
    this.ui = ui;
  }

  /**
   * Extract message from parsed response (speak or thought)
   * @param parsed - Parsed response object
   * @returns Extracted message
   */
  extractMessage(parsed: ParsedResponse): string {
    if (parsed.speak) {
      return parsed.speak;
    }
    if (parsed.thought) {
      return parsed.thought;
    }
    return '';
  }

  /**
   * Record entry to Hansard and update UI
   * @param speaker - Speaker name
   * @param message - Message to record
   * @param metadata - Optional metadata
   */
  recordToHansard(speaker: string, message: string, metadata: Record<string, unknown> = {}): HansardEntry | null {
    if (!message) return null;
    const entry = this.session.addToHansard(speaker, message, metadata);
    this.ui.addHansardEntry(entry);
    return entry;
  }

  /**
   * Execute action and handle errors
   * @param action - Action command to execute
   * @param speakerName - Name of speaker for error messages
   * @returns Tool execution result
   */
  executeAction(action: string, speakerName: string = 'Unknown'): ToolResult | null {
    if (!action) return null;
    
    const result = this.session.executeTool(action);
    if (result.status === 'error') {
      this.ui.addSystemMessage(`Tool error from ${speakerName}: ${result.message || 'Unknown error'}`);
    }
    return result;
  }

  /**
   * Process Speaker response: parse, record to Hansard, and execute actions
   */
  async processSpeakerResponse(
    speakerResponse: string,
    invokeMembers: InvokeMembersFunction,
    invokeMember: InvokeMemberFunction
  ): Promise<{ adjourned: boolean }> {
    const parsed = this.api.parseResponse(speakerResponse);

    // Build message from speech only (action goes in metadata, not message)
    const message = this.extractMessage(parsed);
    const metadata = parsed.action ? { command: parsed.action } : {};

    // Record single entry with speech (action appears only in execution portion via metadata)
    this.recordToHansard('Speaker', message, metadata);

    // Execute Speaker's command
    if (parsed.action) {
      const result = this.executeAction(parsed.action, 'Speaker');

      if (result && result.data && result.data.requiresInvocation) {
        // Handle parliament-recognize: invoke member(s)
        const recognizeData = result.data;
        const instruction = recognizeData.instruction || 'What is your response?';
        
        if (recognizeData.target === 'all') {
          // Invoke all members
          this.ui.addSystemMessage('Recognizing all members...');
          const memberResponses = await invokeMembers(instruction);
          
          // Process member responses
          for (let i = 0; i < memberResponses.length; i++) {
            await this.processMemberResponse(memberResponses[i], i + 1);
          }
        } else {
          // Invoke specific member
          const memberNumber = recognizeData.target;
          if (typeof memberNumber === 'number') {
            this.ui.addSystemMessage(`Recognizing Member ${memberNumber}...`);
            const memberResponse = await invokeMember(memberNumber, instruction);
            await this.processMemberResponse(memberResponse, memberNumber);
          }
        }
        
        this.ui.updateAll(this.session);
      }

      // Check if House was adjourned
      if (this.session.state.adjourned) {
        this.ui.addSystemMessage('The House has been adjourned. Session ending.');
        return { adjourned: true };
      }

      this.ui.updateAll(this.session);
    }

    return { adjourned: false };
  }

  /**
   * Process Member response: parse, record to Hansard, execute actions
   */
  async processMemberResponse(memberResponse: string, memberNumber: number): Promise<void> {
    const parsed = this.api.parseResponse(memberResponse);
    const memberName = `Member ${memberNumber}`;

    if (parsed.pass) {
      this.recordToHansard(memberName, 'Pass');
      return;
    }

    if (parsed.vote) {
      // Vote is in Speak section - record full Speak content to Hansard and extract vote
      const voteMessage = parsed.speak || `Votes: ${parsed.vote}`;
      this.recordToHansard(memberName, voteMessage);
      this.session.recordVote(memberName, parsed.vote);
      return;
    }

    // Build the message: speech + action (if present)
    let message = '';
    
    // Check if there's a # Speak section or Action section (flexible #+ Action pattern)
    const hasSpeakSection = memberResponse.includes('# Speak');
    const hasActionSection = /#+ Action/.test(memberResponse);
    
    if (hasSpeakSection || hasActionSection) {
      // Use parsed sections if they exist
      message = this.extractMessage(parsed);
      
      // Append action to the message if present
      if (parsed.action) {
        if (message) {
          message += '\n\n```\n' + parsed.action + '\n```';
        } else {
          message = '```\n' + parsed.action + '\n```';
        }
      }
    } else {
      // No # Speak or # Action sections - use full response as-is
      message = memberResponse.trim();
    }
    
    // Record single entry with speech and action combined (or full response)
    this.recordToHansard(memberName, message);

    // Execute action if any
    if (parsed.action) {
      this.executeAction(parsed.action, memberName);
    }
  }
}
