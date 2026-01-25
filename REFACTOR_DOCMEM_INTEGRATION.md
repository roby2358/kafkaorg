# Docmem Integration Refactoring

## Overview

Refactored the multi-agent architecture to integrate docmem operations directly into the conversational agent, eliminating the need for a separate docmem agent. This simplifies the architecture and makes docmem a core capability of the conversational agent.

## Changes Made

### 1. Agent Architecture Simplification

**Before:**
- UI Agent ↔ Conversational Agent ↔ Docmem Agent
- Conversational agent sent commands to docmem agent via Kafka topics
- Docmem agent executed commands and returned results

**After:**
- UI Agent ↔ Conversational Agent (with integrated docmem tools)
- Conversational agent executes docmem commands directly
- No inter-agent communication needed for docmem operations

### 2. Files Modified

#### `src/agents/ConversationalAgent.ts`
- **Added**: Direct docmem command execution via `executeCommand()` method
- **Added**: Imports for `Docmem`, `DocmemCommands`, and `SystemCommands`
- **Removed**: Sub-conversation logic (`startSubConversation()`, `sendToDocmemAgent()`)
- **Removed**: Tool response handling (`handleToolResponse()`)
- **Removed**: Pending commands tracking
- **Changed**: `processCommand()` now executes commands directly instead of routing to agents

#### `src/orchestration/framework.ts`
- **Removed**: `DocmemAgent` import
- **Removed**: `spawnDocmemAgent()` method
- **Removed**: `startSubConversation()` method

#### `src/system_prompts/conversational_with_tools.ts` (NEW)
- **Created**: Combined system prompt that includes both conversation capabilities and docmem tool documentation
- **Combines**: Base conversation prompt from `conversation.ts` + docmem commands from `docmem_tools_prompt.ts`
- **Exported**: `CONVERSATIONAL_WITH_TOOLS_PROMPT` constant

#### `db/seed_agent_prototypes.sql`
- **Removed**: `docmem-agent` prototype definition
- **Updated**: `conversational-agent` with complete system prompt including docmem commands
- **Updated**: Role description to "Conversational AI with integrated tools"

#### `scripts/update-seed-prompt.ts` (NEW)
- **Created**: Script to update seed file with TypeScript-generated system prompt
- **Purpose**: Ensures seed file stays in sync with TypeScript prompt definitions
- **Usage**: `npx tsx scripts/update-seed-prompt.ts`

#### `src/agents/DocmemAgent.ts` (DELETED)
- Removed entirely as functionality is now in ConversationalAgent

### 3. Database Changes

**Removed from database:**
- `docmem-agent` agent prototype
- All `docmem-agent` instances
- Topics connecting conversational agents to docmem agents

**Command to apply changes:**
```bash
cat db/seed_agent_prototypes.sql | podman exec -i kafkaorg_kafkaorg_1 psql -U postgres -d kafkaorg
```

### 4. Command Execution Flow

**Before:**
1. User sends message → Conversational Agent
2. Conversational Agent extracts # Run blocks
3. Conversational Agent sends command to Docmem Agent via Kafka
4. Docmem Agent executes command
5. Docmem Agent sends result back via Kafka
6. Conversational Agent forwards result to UI

**After:**
1. User sends message → Conversational Agent
2. Conversational Agent extracts # Run blocks
3. Conversational Agent executes command directly
4. Conversational Agent sends result to UI

### 5. System Prompt Enhancement

The conversational agent now has complete documentation for:
- Docmem command syntax and parameters
- Node ID management (auto-generated vs user-specified)
- Context field requirements and usage
- Command response formats
- All available docmem operations:
  - Creation: `docmem-create`, `docmem-create-node`
  - Updates: `docmem-update-content`, `docmem-update-context`
  - Movement: `docmem-move-node`, `docmem-copy-node`
  - Deletion: `docmem-delete`
  - Queries: `docmem-structure`, `docmem-serialize`, `docmem-find`
  - Summaries: `docmem-add-summary`
  - Static: `docmem-get-all-roots`

## Benefits

1. **Simpler Architecture**: Fewer agents, fewer Kafka topics, easier to understand
2. **Lower Latency**: No inter-agent communication overhead for docmem operations
3. **Easier Maintenance**: Tool execution logic in one place
4. **Better Integration**: Docmem is now a first-class capability, not an external service
5. **Reduced Complexity**: No correlation IDs, no pending command tracking, no sub-conversations

## Testing

To verify the refactoring:

1. Start a new conversation
2. Test docmem commands:
   ```
   User: Create a docmem called test-notes
   Agent: [executes docmem-create test-notes directly]

   User: Add a child node to test-notes
   Agent: [executes docmem-create-node directly]
   ```

Expected behavior:
- Commands execute without errors
- Results are displayed to the user
- No docmem-agent instances are created
- Logs show "Executing command: docmem-..." from ConversationalAgent

## Migration Notes

- Existing conversations with docmem-agent instances will no longer work properly
- To clean up old instances, restart the system or manually delete old agent instances
- The seed script automatically updates the conversational-agent prototype on next apply

## Future Enhancements

Potential improvements enabled by this refactoring:
1. Per-conversation docmem instances (automatic memory for each conversation)
2. Automatic context window management using docmem
3. Tool result caching in docmem
4. Multi-turn tool execution planning
