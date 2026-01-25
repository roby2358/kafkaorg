# Multi-Agent Architecture - Implementation Plan

## What's Been Created

### 1. Database Schema (`db/schema_new.sql`)
New schema with four main tables:
- `agent_prototypes` - Templates for agent types (ui, conversational, docmem)
- `conversations` - UUID-based conversation metadata
- `agent_instances` - Runtime agent instances
- `topics` - Agent-to-agent communication channels

### 2. Prisma Schema (`prisma/schema_new.prisma`)
Updated Prisma schema matching the new database design with proper relations.

### 3. Seed Data (`db/seed_agent_prototypes.sql`)
Initial agent prototypes:
- `ui-agent` - WebSocket proxy
- `conversational-agent` - OpenRouter orchestrator
- `docmem-agent` - Tool executor

### 4. TypeScript Types (`src/kafka/types.ts`)
Updated `ConversationMessage` interface with:
- `conversation_id` as string (UUID)
- `agent_id` as string (instance ID)
- `command` array for parsed commands
- `correlation_id` for async request-reply

### 5. Orchestration Framework (`src/orchestration/framework.ts`)
Core framework that manages:
- Creating conversations with agent topology
- Spawning agent instances
- Creating topics between agents
- Starting sub-conversations
- Stopping agents and conversations

### 6. Design Documentation (`DESIGN_MULTI_AGENT.md`)
Complete architecture documentation explaining:
- Agent types and responsibilities
- Message flow diagrams
- Database schema details
- Context management strategy
- Benefits and future extensions

## Migration Steps

### Phase 1: Database Migration
```bash
# Backup current database
pg_dump kafkaorg > backup.sql

# Apply new schema
psql -U postgres -d kafkaorg -f db/schema_new.sql

# Seed agent prototypes
psql -U postgres -d kafkaorg -f db/seed_agent_prototypes.sql

# Replace Prisma schema
mv prisma/schema.prisma prisma/schema_old.prisma
mv prisma/schema_new.prisma prisma/schema.prisma

# Regenerate Prisma client
pnpm prisma:generate
```

### Phase 2: Agent Implementation

#### A. Base Agent Class
Create `src/agents/BaseAgent.ts`:
```typescript
export abstract class BaseAgent {
  protected id: string;
  protected conversationId: string;
  protected topics: Map<string, Consumer>;

  abstract start(): Promise<void>;
  abstract handleMessage(msg: ConversationMessage): Promise<void>;
  abstract stop(): Promise<void>;
}
```

#### B. UI Agent
Create `src/agents/UIAgent.ts`:
- WebSocket connection management
- Forward messages between WebSocket and Kafka
- No LLM calls

#### C. Conversational Agent
Update `src/kafka/agent.ts` → `src/agents/ConversationalAgent.ts`:
- Subscribe to UI ↔ Conversational topic
- Call OpenRouter API
- Parse `# Run` blocks
- Detect `start-conversation` commands
- Route tool commands to specialized agents
- Handle correlation IDs for async responses

#### D. Docmem Agent
Create `src/agents/DocmemAgent.ts`:
- Subscribe to Conversational ↔ Docmem topic
- Receive messages with `command` field
- Execute docmem operations directly (no LLM)
- Return structured results

### Phase 3: Framework Integration

#### A. Update `src/index.ts`
Replace current agent startup with orchestration framework:
```typescript
import { orchestrationFramework } from './orchestration/framework.js';

// On server start: Load existing conversations
const activeConversations = await prisma.conversation.findMany({
  include: { agents: true, topics: true }
});

// Start agents for each active conversation
for (const conv of activeConversations) {
  // Spawn UI, Conversational, and any sub-agents
  await spawnConversationAgents(conv);
}
```

#### B. Update WebSocket Handler
Modify `src/websocket/conversation-handler.ts`:
- On new connection, get or create UI agent
- Route messages through UI agent (not directly to Kafka)

#### C. Update API Routes
Modify `src/routes/api/conversation.ts`:
```typescript
// Create conversation
router.post('/conversations', async (req, res) => {
  const conversationId = await orchestrationFramework.createConversation(
    req.body.user_id,
    req.body.description
  );
  res.json({ conversation_id: conversationId });
});
```

### Phase 4: Command Interception

#### A. Create Command Interceptor
Create `src/orchestration/interceptor.ts`:
```typescript
export async function interceptCommands(
  response: string,
  agentId: string,
  conversationId: string
): Promise<void> {
  const commands = extractRunBlocks(response);

  for (const cmd of commands) {
    const args = parseCommand(cmd);

    if (args[0] === 'start-conversation') {
      // Spawn new agent
      await orchestrationFramework.startSubConversation(
        conversationId,
        agentId,
        args[1]
      );
    } else {
      // Route to appropriate agent
      await routeCommandToAgent(args, agentId, conversationId);
    }
  }
}
```

#### B. Integrate with Conversational Agent
```typescript
// In ConversationalAgent.handleMessage()
const llmResponse = await this.openRouter.chat(history);

// Intercept commands
await interceptCommands(llmResponse, this.id, this.conversationId);

// Send clean response to UI
const cleanResponse = removeRunBlocks(llmResponse);
await this.sendToUI(cleanResponse);
```

### Phase 5: Testing

#### A. Unit Tests
- Test orchestration framework methods
- Test agent message handling
- Test command parsing and routing

#### B. Integration Tests
```typescript
// Test: Create conversation
const convId = await framework.createConversation(userId, "Test");
expect(convId).toBeDefined();

// Test: Start sub-conversation
const { agentId } = await framework.startSubConversation(
  convId,
  conversationalAgentId,
  'docmem-agent'
);
expect(agentId).toContain('docmem-agent-');

// Test: Message flow
await sendUserMessage(convId, "Create docmem test");
// Assert: Docmem agent received command
// Assert: User received success message
```

#### C. End-to-End Tests
- Full user flow through WebSocket
- Multi-agent coordination
- Tool execution and result routing

## Breaking Changes

### What Changes
- `conversation_id`: `number` → `string` (UUID)
- `agent_id`: `number` → `string` (instance ID)
- Database schema completely restructured
- Agent lifecycle managed by framework (not manual start/stop)

### Migration Path
This is a **breaking rewrite** of the agent system. Recommend:
1. Deploy new schema to fresh database
2. Build new agents alongside old ones
3. Test thoroughly before switching
4. No data migration needed (conversations in Kafka, not DB)

## Rollout Strategy

### Option A: Big Bang
1. Apply all changes at once
2. Rebuild database from scratch
3. Deploy new agent system
4. **Risk**: High, but clean break

### Option B: Gradual
1. Deploy new schema alongside old (different tables)
2. Build new agents
3. Route new conversations to new system
4. Keep old system for existing conversations
5. **Risk**: Lower, but more complexity

### Recommendation
**Big Bang** - Since you're iterating and rebuilding database anyway, go for clean break. The old system is still in git if you need to roll back.

## Next Steps

1. **Review this plan** - Any questions or concerns?
2. **Apply database changes** - Rebuild with new schema
3. **Implement BaseAgent class** - Foundation for all agents
4. **Build UIAgent** - Simplest agent, good starting point
5. **Update ConversationalAgent** - Core orchestrator
6. **Build DocmemAgent** - Tool executor
7. **Test end-to-end** - Full user flow
8. **Iterate** - Add more specialized agents as needed

## Questions to Consider

1. **Agent registry**: In-memory or database? (Currently database)
2. **Topic cleanup**: Auto-delete old topics or keep forever?
3. **Agent persistence**: Store agent state or purely ephemeral?
4. **Error handling**: What happens if docmem agent crashes mid-operation?
5. **Observability**: How to monitor multi-agent conversations?
6. **Scaling**: How many concurrent conversations can system handle?

## Future Enhancements

- **Python agents** for ML/data processing
- **Bash agent** for shell command execution
- **Search agent** for web search
- **Coordinator agent** for multi-agent task orchestration
- **Agent marketplace** - plug-and-play agent types
- **Agent composition** - chain multiple agents together
