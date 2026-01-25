# Multi-Agent Architecture Design

## Overview

Kafkaorg uses a three-tier agent architecture where specialized agents communicate through Kafka topics. Each conversation spawns a set of ephemeral agent instances that collaborate to fulfill user requests.

## Agent Types

### 1. UI Agent
**Role**: WebSocket ↔ Kafka bridge
**Technology**: TypeScript (no LLM)
**Responsibilities**:
- Accept WebSocket connections from browser
- Forward user messages to conversational agent topic
- Stream agent responses back to browser
- Pure data proxy - no business logic

### 2. Conversational Agent
**Role**: Orchestrator and user-facing AI
**Technology**: TypeScript + OpenRouter API (Claude Sonnet 4.5)
**Responsibilities**:
- Maintain conversation context with user
- Generate natural language responses
- Detect when tool execution is needed
- Spawn specialized agents via `start-conversation` command
- Summarize tool results for user

### 3. Docmem Agent
**Role**: Tool executor for docmem operations
**Technology**: TypeScript (no LLM - direct execution)
**Responsibilities**:
- Execute docmem commands
- Maintain docmem state for conversation
- Return structured results
- No conversational capability

## Message Flow

### Simple Conversation (No Tools)

```
User (browser)
    ↓ "Hello"
UI Agent
    ↓ topic: ui-agent-{id}-conversational-agent-{id}
Conversational Agent
    ↓ (calls OpenRouter)
    ↓ "Hi! How can I help?"
UI Agent
    ↓ WebSocket
User sees response
```

### Tool Execution Flow

```
User (browser)
    ↓ "Create docmem called project-notes"
UI Agent
    ↓ topic: ui-{id}-conv-{id}
Conversational Agent
    ↓ (calls OpenRouter, gets # Run block)
    ↓ Extracts: start-conversation docmem-agent
Framework intercepts
    ↓ Creates: conv-{id}-docmem-{id} topic
    ↓ Spawns: docmem-agent-{id}
Conversational Agent
    ↓ Sends: { command: ["docmem-create", "project-notes"] }
    ↓ topic: conv-{id}-docmem-{id}
Docmem Agent
    ↓ Executes command
    ↓ Returns: { result: "created project-notes" }
Conversational Agent
    ↓ Receives result
    ↓ Formats user-friendly response
    ↓ "I've created the docmem 'project-notes' for you."
    ↓ topic: ui-{id}-conv-{id}
UI Agent
    ↓ WebSocket
User sees: "I've created the docmem 'project-notes' for you."
```

## Message Format

All messages use the same schema across all topics:

```typescript
interface ConversationMessage {
  conversation_id: string;      // UUID
  user_id: string | null;       // User ID or null
  agent_id: string | null;      // Agent instance ID or null
  message: string;              // Message content
  timestamp: string;            // ISO 8601
  command?: string[];           // Optional: parsed command
  correlation_id?: string;      // Optional: for async request-reply
}
```

**User messages**: `user_id` set, `agent_id` null
**Agent messages**: `agent_id` set, `user_id` null
**Tool commands**: `command` field populated with parsed args

## Database Schema

### agent_prototypes
Templates for agent types. Defines system prompts and models.

```sql
CREATE TABLE agent_prototypes (
  id SERIAL PRIMARY KEY,
  name VARCHAR(64) UNIQUE,        -- "ui-agent", "conversational-agent", etc.
  role VARCHAR(256),              -- Description
  system_prompt TEXT,             -- System prompt template
  model VARCHAR(256)              -- OpenRouter model ID
);
```

### conversations
Conversation metadata (UUID-based).

```sql
CREATE TABLE conversations (
  id VARCHAR(36) PRIMARY KEY,     -- UUID
  user_id VARCHAR(32),
  description VARCHAR(1024),
  created TIMESTAMP
);
```

### agent_instances
Runtime agent instances (ephemeral).

```sql
CREATE TABLE agent_instances (
  id VARCHAR(128) PRIMARY KEY,    -- "conversational-agent-abc123"
  prototype_id INT,               -- References agent_prototypes
  conversation_id VARCHAR(36),    -- References conversations
  status VARCHAR(16),             -- running, stopped, error
  created TIMESTAMP,
  stopped TIMESTAMP
);
```

### topics
Tracks agent-to-agent communication channels.

```sql
CREATE TABLE topics (
  name VARCHAR(256) PRIMARY KEY,  -- "ui-agent-x-conversational-agent-y"
  conversation_id VARCHAR(36),
  participant1_id VARCHAR(128),   -- Agent instance ID
  participant2_id VARCHAR(128),   -- Agent instance ID
  created TIMESTAMP
);
```

## Orchestration Framework

The `OrchestrationFramework` class manages agent lifecycle:

### Creating a Conversation

```typescript
const framework = new OrchestrationFramework();
const conversationId = await framework.createConversation(userId, "User chat");

// Creates:
// - Conversation record (UUID)
// - UI agent instance
// - Conversational agent instance
// - Topic connecting them
```

### Starting Sub-Conversations

When conversational agent executes `start-conversation docmem-agent`:

```typescript
const { agentId, topicName } = await framework.startSubConversation(
  conversationId,
  conversationalAgentId,
  'docmem-agent'
);

// Creates:
// - Docmem agent instance
// - Topic connecting conversational ↔ docmem agents
```

### Stopping Agents

```typescript
await framework.stopConversation(conversationId);
// Stops all agent instances for the conversation
```

## Context Management

### Conversational Agent Maintains Two Contexts

**User-facing context** (clean conversation):
```typescript
[
  { role: 'user', content: 'Create docmem project-notes' },
  { role: 'assistant', content: 'Created docmem project-notes!' }
]
```

**Tool execution context** (hidden from user):
- Commands sent to docmem agent
- Results received from docmem agent
- Internal coordination

This separation:
- Keeps user conversation clean and readable
- Reduces token usage (no tool commands in main context)
- Allows specialized agents to handle complex operations

## Agent Lifecycle

1. **Spawn**: Framework creates agent instance on conversation start
2. **Connect**: Agent subscribes to its topics
3. **Process**: Agent consumes messages and produces responses
4. **Coordinate**: Framework routes `start-conversation` commands
5. **Stop**: Framework stops agents when conversation ends

## Benefits

✓ **Clean separation**: Each agent has a single responsibility
✓ **Polyglot ready**: Easy to add Python/Go agents later
✓ **Token efficient**: Tool commands don't clutter user conversation
✓ **Scalable**: Agents can spawn other agents dynamically
✓ **Observable**: All interactions logged in Kafka topics
✓ **Fault tolerant**: Agents can crash/restart, topics persist

## Future Extensions

- **Bash Agent**: Execute shell commands in isolated environment
- **Search Agent**: Web search and data retrieval
- **Memory Agent**: Long-term memory and context retrieval
- **Coordinator Agent**: Multi-agent task orchestration
- **Python Agents**: ML/data processing agents in Python
