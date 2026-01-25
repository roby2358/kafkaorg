
# Agent Communication Specification

## Overview

Agents represent functional code units in the system. Some are tied to AI APIs (LLM agents), others are pure code (system agents, UI agents).

Agents communicate through Kafka topics using a docmem-based message format. Each agent owns a single topic through which all of its conversations flow. Multiple conversations are multiplexed on the agent's topic, distinguished by `conversation_id`. Agents consume from their own topic using a dedicated consumer group, filtering by `conversation_id` to maintain separate conversation contexts and by `agent_id` to ignore their own messages. This architecture scales to thousands of conversations per agent without creating thousands of topics.

## Architecture: Kafka vs Docmem

**Kafka provides sequencing**: Kafka records establish the order of events and act as the append-log for conversation progression.

**PostgreSQL/docmem provides content**: All conversation docmems are stored in PostgreSQL. Kafka records reference docmem nodes by ID but do not contain the message content itself.

**Agents maintain materialized views**: Each agent caches an in-memory materialized view of conversations it participates in. When a new Kafka record arrives, the agent:
1. Fetches the referenced node content from PostgreSQL/docmem
2. Appends it to the cached message list
3. Processes the updated conversation (e.g., sends to LLM API)

This separation allows:
- **Kafka**: Durable ordering, replay capability, topic partitioning
- **Docmem**: Structured storage, tree hierarchy, optimistic locking, rich metadata
- **Cache**: Fast LLM API request building without repeated database queries

## Conversation Docmem Structure

The primary ID for records in an agent's topic is a `docmem_node_id` that represents the conversation root. Typically, these will be conversation docmems, but they don't have to be.

**Initialization** (action="create"):
- The UI agent creates a new conversation docmem with:
  - **Root node**: Contains conversation metadata (blank for now)
  - **First content node**: The initial user message
- Future: Other input channels (e.g., Bluesky notifications) will create similar structures

**Content nodes**: Each message (user, assistant, tool result) is a separate child node of the root.

**Node content**: Strictly plain text. No metadata or structured data in content. If metadata is needed, it will be stored in separate nodes (structure TBD).

**Context metadata pattern**: Conversation nodes use the pattern `text:agent:{agent_id}`
- **Type**: `text` for message content, `summary` for conversation summaries (future)
- **Name**: `agent` (constant for conversation messages)
- **Value**: The agent ID (e.g., `"ui-123"`, `"conversational-456"`, `"tool"`)

**Examples**:
```
Root node:
  Context: (blank for now)
  Content: ""

User message node:
  Context: text:agent:ui-123
  Content: "Hello, how are you?"

Agent response node:
  Context: text:agent:conversational-456
  Content: "I'm doing well, thanks! How can I help you today?"

Tool result node:
  Context: text:agent:tool
  Content: "total 48\ndrwxr-xr-x  12 user  staff   384 Jan 24 10:30 src\n..."
```

**Root node content**: Currently left blank. In the future, may contain:
- Docmem metadata schema (types, context_names, context_values)
- Conversation participants
- Conversation settings

## Message List Construction (LLM API Format)

When building the message list for LLM API calls, agents use **role-relative perspective** based on the `agent_id` in the Kafka record:

**Role assignment logic**:
```typescript
function getRole(record: ConversationMessage, myAgentId: string): "user" | "assistant" {
  if (record.agent_id === myAgentId) {
    return "assistant";  // My own messages
  } else {
    return "user";       // Everyone else's messages (other agents, users, tools)
  }
}
```

**Examples** (from perspective of `conversational-agent-456`):
- `agent_id="ui-123"` → `role=user` (other agent)
- `agent_id="conversational-456"` → `role=assistant` (my own message)
- `agent_id="tool"` → `role=user` (tool results)

**Message list construction**:
1. Fetch all nodes for the conversation from docmem (in order)
2. For each node:
   - Read node content (plain text)
   - Read context metadata to get `agent_id` from `text:agent:{agent_id}`
   - Determine role based on whether `agent_id` matches this agent's ID
   - Append to message list: `{role, content}`

This ensures each agent sees a coherent conversation from its own perspective, compatible with OpenRouter/Anthropic API expectations.

## Kafka Record Format

```typescript
interface ConversationMessage {
  // Envelope metadata
  version: string;              // Format version (e.g., "1.0.0") for extensibility
  conversation_id: string;      // UUID identifying the conversation
  agent_id: string;             // ALWAYS the sender agent instance ID (e.g., "conversational-agent-abc123")
                                // Use agent_id="tool" for tool results
  timestamp: string;            // ISO 8601 timestamp
  correlation_id?: string;      // For async request-reply matching (optional)

  // Docmem references
  docmem_node_id: string;       // The conversation docmem root node ID
  node_id: string;              // The specific node ID for this message (the new content node)

  // Action semantics
  action: string;               // Operation type: "create", "append", "edit", "delete",
                                // "tool_invoke", "tool_result", "system_message"
                                // (loosely specified, extensible)

  // Legacy/compatibility
  command?: string[];           // Parsed command for tool execution (optional, kept for compatibility)
}
```

**Kafka message format** (when producing):
```typescript
await producer.send({
  topic: targetAgentTopic,
  messages: [{
    key: conversation_id,        // Partition key for consistent routing
    value: JSON.stringify(record)
  }]
});
```

**Key semantics**:
- **`agent_id` is always the sender**: The conversation_id identifies the participants, so we don't need separate from/to fields
- **Partition key is `conversation_id`**: Ensures all messages for a conversation go to the same partition (for future scaling). Currently using 1 partition per topic.
- **Content is NOT in Kafka**: The `message` field is dropped. Content lives in the docmem node referenced by `node_id`
- **`action` is loosely specified**: Common values are "create" (new conversation), "append" (add message), "edit" (modify node), "delete" (remove node), "tool_invoke", "tool_result", "system_message". Agents may define custom actions.

## Communication Flow

### Basic Message Exchange

**Topology**: For a conversation between UI Agent (id: `ui-123`) and Conversational Agent (id: `conv-456`):
- **The conversation lives on the target agent's topic**: `conversational-agent-456`
- **Both agents listen to the same topic**: `conversational-agent-456`
- **Both agents produce to the same topic**: `conversational-agent-456`
- Each uses dedicated consumer groups: `agent-ui-123` and `agent-conv-456`
- Agents filter by `agent_id` to ignore their own messages

1. **Client agent (UI-123) sends a message**:
   - Receives plain text from WebSocket: `"Hello, how are you?"`
   - Creates a new content node in the conversation docmem (PostgreSQL):
     - **Context**: `text:agent:ui-123`
     - **Content**: `"Hello, how are you?"`
     - **Parent**: Conversation root node
   - Produces a Kafka record to **conversational agent's topic** (`conversational-agent-456`) with:
     - `key`: conversation_id (partition key)
     - `value`: {
       - `conversation_id`: the conversation UUID
       - `docmem_node_id`: conversation root ID
       - `node_id`: the newly created content node ID
       - `action`: "create" (new conversation) or "append" (continuing conversation)
       - `agent_id`: `"ui-123"` (sender)
     - }

2. **Server agent (conv-456) receives the record**:
   - Consumes from its own topic (`conversational-agent-456`) using consumer group `agent-conv-456`
   - Checks: `if (msg.agent_id === "conv-456") continue;` (ignore my own messages)
   - Filters: `if (msg.conversation_id !== targetConversationId) continue;`
   - Fetches the content node from PostgreSQL by `node_id`
   - Reads node content: `"Hello, how are you?"`
   - Reads context metadata: `text:agent:ui-123` → agent_id is "ui-123" → role is "user" (not me)
   - Updates cached message list: `[...messages, {role: "user", content: "Hello, how are you?"}]`
   - Sends message list to OpenRouter API

3. **Server agent (conv-456) responds**:
   - Receives LLM response from API: `"I'm doing well, thanks! How can I help you today?"`
   - Creates a new content node in the conversation docmem:
     - **Context**: `text:agent:conv-456`
     - **Content**: `"I'm doing well, thanks! How can I help you today?"`
     - **Parent**: Conversation root node
   - Produces a Kafka record to **the same topic** (`conversational-agent-456`) with:
     - `key`: conversation_id
     - `value`: {
       - `conversation_id`: same conversation UUID
       - `docmem_node_id`: conversation root ID
       - `node_id`: the new response node ID
       - `action`: "append"
       - `agent_id`: `"conv-456"` (sender)
     - }

4. **Client agent (UI-123) receives the response**:
   - Consumes from the conversational agent's topic (`conversational-agent-456`) using consumer group `agent-ui-123`
   - Checks: `if (msg.agent_id === "ui-123") continue;` (ignore my own messages)
   - Filters by `conversation_id`
   - Fetches the content node from PostgreSQL by `node_id`
   - Reads node content: `"I'm doing well, thanks! How can I help you today?"`
   - Forwards plain text to WebSocket client: `"I'm doing well, thanks! How can I help you today?"`

**Key insight**: The conversation lives on the **target/service agent's topic**. Both agents listen to and produce to the same topic, creating a bidirectional channel. Each agent filters out its own messages by checking `agent_id`. If a UI agent has conversations with multiple conversational agents, it subscribes to multiple topics (one per conversational agent it's talking to).

### Tool Execution Flow

When an agent invokes tools:

1. **Agent (conv-456) detects tool invocation in LLM response** (e.g., via structured output parsing of "# Run bash ls -la")
2. **Agent executes the tool** (e.g., runs bash command) and captures the result (plain text output)
3. **Agent creates tool result content node** in the conversation docmem:
   - **Context**: `text:agent:tool`
   - **Content**: Tool output as plain text (e.g., "total 48\ndrwxr-xr-x...")
   - **Parent**: Conversation root node
4. **Agent produces Kafka record to its own topic** (`conversational-agent-456`) with:
   - `conversation_id`: the conversation UUID
   - `node_id`: the tool result node ID
   - `action`: "append"
   - `agent_id`: "tool" (indicates framework/interpreter origin, not the agent itself)
5. **Agent receives its own tool result record** from Kafka (via its consumer group)
6. **Agent filters**: Recognizes `agent_id="tool"` as a tool result (not to be ignored like its own `agent_id="conv-456"` messages)
7. **Agent fetches node content** and appends to message list with `role=user` (since `agent_id != "conv-456"`)
8. **Agent sends updated message list** back to LLM API to continue the conversation

**Tool result workflow summary**:
```
Agent → Execute tool → Append docmem node text:agent:tool →
Produce Kafka record {agent_id:"tool"} →
Agent consumes own topic → Fetch node → Add to cache as role=user →
Send to LLM API
```

This creates a continuous conversation loop where tool results flow through the agent's own topic, maintaining total ordering of all events for that agent.

### Conversation Lifecycle

**Append-only semantics**: Conversations are effectively append-only logs. While docmem supports optimistic locking for edits, typical conversation flow is purely additive.

**Multi-conversation caching**: Agents maintain a map of conversation caches: `Map<conversation_id, MessageList>`. When a record arrives:
1. Filter by `conversation_id` to find the target cache
2. If cache doesn't exist (new conversation or post-restart), initialize it
3. Fetch the node content from PostgreSQL
4. Append to the conversation's message list

**Cache invalidation**: Agents track the latest `node_id` they've processed per conversation. If they see an out-of-order record or restart, they can rebuild the cache by:
1. Consuming their topic from the beginning
2. Filtering by `conversation_id`
3. Fetching each node from PostgreSQL
4. Rebuilding the message list in Kafka offset order

**Consumer group semantics**: Each agent instance uses a **dedicated consumer group** (e.g., `agent-{agentId}`). This ensures:
- The agent receives ALL messages on its topic (no load balancing across different agent types)
- Offset tracking per agent (for replay after restart)
- Isolation from other agents' consumption

**WebSocket protocol**: The UI communicates with the system via plain text messages over WebSocket. The server-side UI agent is responsible for:
- Converting incoming plain text to docmem nodes
- Producing Kafka records to the conversational agent's topic
- Consuming from its own topic and streaming plain text responses back to the WebSocket client

No docmem concepts are exposed to the WebSocket layer - it remains a simple text-in, text-out interface.

**Note on current implementation**: The existing codebase creates one topic per conversation (e.g., `ui-agent-123-conversational-agent-456`). This spec describes the **target architecture** with agent-owned topics and conversation multiplexing. The migration will involve:
1. Changing topic naming from `{agent1}-{agent2}` to `{agent-type}-{instance-id}`
2. Adding `conversation_id` filtering in agent message handling
3. Supporting multiple conversation caches per agent instance
4. Implementing docmem-based message storage and retrieval
5. Using `conversation_id` as partition key (starting with 1 partition per topic)

## Topic Architecture: Design Choices

We considered three approaches for agent-to-agent communication topology:

### Option 1: Agent-Owned Topic with Conversation Multiplexing (CHOSEN)

**Design**: Each agent owns one topic. Multiple conversations are multiplexed on this topic, distinguished by `conversation_id`. For any given conversation, **all participating agents listen to and produce to the same topic** (the target/service agent's topic). Each agent uses a dedicated consumer group to ensure it receives all messages. Agents filter by `conversation_id` to maintain separate conversation contexts and by `agent_id` to ignore their own messages.

**Example**: For a conversation between UI Agent A and Conversational Agent B:
- Topic used: `conversational-agent-B` (owned by the service agent)
- UI Agent A: subscribes to `conversational-agent-B`, produces to `conversational-agent-B`
- Conversational Agent B: subscribes to `conversational-agent-B`, produces to `conversational-agent-B`
- Both filter by `agent_id` to ignore their own messages

**Real-world examples**:
- **Kafka event sourcing**: Domain events for an aggregate are stored in a single topic/partition
- **Slack/Discord channels**: All participants read and write to the same channel
- **Git commit log**: All contributors append to the same history, creating a total order
- **CQRS event stores**: Events for an entity are appended to one stream

**Applicability**:
- Systems requiring **total ordering** of events (e.g., transaction logs, audit trails)
- **Collaborative environments** where all participants need full visibility
- **Replay and debugging**: Easy to reconstruct state from a single linear history
- **Event-driven architectures** where downstream consumers need ordered event streams

**Advantages**:
- **Scalable**: N agents = N topics, regardless of number of conversations (vs N² or N×M with other patterns)
- **Total ordering per agent**: All messages to/from an agent are totally ordered by Kafka offset
- **Simple topology**: No topic explosion as conversation count grows
- **Easy replay**: Consuming agent topic from beginning rebuilds all conversation states
- **Natural agent inbox**: Maps to mental model of "agent has an inbox that receives messages from multiple conversations"
- **Dedicated consumer groups**: Each agent gets its own consumer group (e.g., `agent-{agentId}`), ensuring all messages are delivered

**Disadvantages**:
- Agents must filter by `conversation_id` and `agent_id` (minor overhead)
- No per-conversation ordering guarantees across multiple agent topics (but preserved within each agent's topic)
- Partition assignment: All messages for an agent must go to topics consumed by that agent's consumer group

**Example**:
```
Topic: "conversational-agent-456" (agent-owned topic)
Consumers:
  - Conversational agent (consumer group: "agent-conv-456")
  - UI agent for conv-abc (consumer group: "agent-ui-123")
  - UI agent for conv-xyz (consumer group: "agent-ui-789")

[offset 0] {conversation_id: "conv-abc", agent_id: "ui-123", ...}      // Conv ABC: User message (produced by ui-123)
[offset 1] {conversation_id: "conv-abc", agent_id: "conv-456", ...}    // Conv ABC: Agent response (produced by conv-456)
[offset 2] {conversation_id: "conv-xyz", agent_id: "ui-789", ...}      // Conv XYZ: User message (produced by ui-789)
[offset 3] {conversation_id: "conv-abc", agent_id: "tool", ...}        // Conv ABC: Tool result (produced by conv-456)
[offset 4] {conversation_id: "conv-xyz", agent_id: "conv-456", ...}    // Conv XYZ: Agent response (produced by conv-456)
[offset 5] {conversation_id: "conv-abc", agent_id: "conv-456", ...}    // Conv ABC: Agent continues (produced by conv-456)

All agents produce to the same topic. Each filters by conversation_id and agent_id.
```

**Corresponding docmem nodes**:
```
Conversation conv-abc:
  Root (node_id: root-abc)
    ├─ n1: text:agent:ui-123      → "Hello, how are you?"
    ├─ n2: text:agent:conv-456    → "I'm doing well! Let me check the directory..."
    ├─ n3: text:agent:tool        → "total 48\ndrwxr-xr-x  12 user  staff..."
    └─ n4: text:agent:conv-456    → "I found 12 items in the directory..."

Conversation conv-xyz:
  Root (node_id: root-xyz)
    ├─ n5: text:agent:ui-789      → "What's the weather?"
    └─ n6: text:agent:conv-456    → "I don't have access to weather data..."
```

Note how multiple conversations (conv-abc, conv-xyz) are interleaved on the same agent topic. The agent maintains separate in-memory caches per `conversation_id`.

### Option 2: Separate Incoming/Outgoing Topics

**Design**: Each agent has two topics: `agent-X-in` for incoming requests, `agent-X-out` for outgoing responses.

**Real-world examples**:
- **RabbitMQ request/reply queues**: Separate request queue and reply queue per service
- **AWS SQS**: Request queue + response queue pattern for async RPC
- **Apache Camel**: InOut exchange pattern with distinct in/out channels
- **Microservice RPC**: gRPC-style patterns where request and response are logically separate

**Applicability**:
- **Independent scaling**: Different throughput/capacity for requests vs responses
- **Clear service boundaries**: Request and response handling are separate concerns
- **Backpressure management**: Easier to implement flow control per direction
- **Traditional RPC/queue systems** migrating to event-driven architectures

**Advantages**:
- Clear request/response separation
- No need to filter own messages
- Easier to implement backpressure or rate limiting per direction

**Disadvantages**:
- **Complexity**: Double the number of topics to manage
- **No total ordering**: Interleaving of requests and responses is not captured in a single log
- **Harder replay**: Must correlate two separate streams to rebuild conversation state
- **Topic explosion**: N agents = 2N topics, plus combinatorial growth for multi-agent scenarios

**Verdict**: Rejected due to increased complexity and loss of total ordering guarantees.

### Option 3: Incoming Topic with Callback Links

**Design**: Each agent has an incoming topic. Records include a `reply_to_topic` field specifying where to send responses.

**Real-world examples**:
- **AWS Step Functions**: Callback tokens allow async workflows to resume at arbitrary points
- **AMQP routing**: Exchange/routing key patterns where destination is determined dynamically
- **Webhook systems**: HTTP callbacks where response URL is embedded in request
- **Actor model frameworks**: Akka actors with reply-to addresses for location-transparent messaging
- **Temporal/Cadence workflows**: Workflow callbacks with continuation tokens

**Applicability**:
- **Dynamic routing**: Response destination not known until runtime
- **Workflow orchestration**: Long-running processes with arbitrary callback points
- **Fan-out/aggregation**: Scatter requests to many workers, gather responses to coordinator
- **Multi-tenant systems**: Isolate response streams per tenant/client
- **Load balancing**: Distribute work across worker pools with distinct result queues

**Advantages**:
- Flexible routing: Responses can go to different topics
- Each agent only consumes one topic (its inbox)
- Supports complex routing patterns (e.g., supervisor agents, load balancers)

**Disadvantages**:
- **Loss of conversation context**: No single topic contains the full conversation history
- **Replay complexity**: Must traverse callback links across multiple topics to rebuild state
- **Requires correlation IDs**: Must track request/response pairs manually
- **State management**: Agents must maintain routing tables (reply_to mappings)

**Verdict**: Rejected as over-engineered for current requirements. May revisit for advanced multi-agent orchestration patterns.

### Conclusion

We chose **Option 1 (agent-owned topic with conversation multiplexing)** for its scalability and simplicity. The agent-owned topology means the number of topics scales with the number of agents, not the number of conversations. This is critical for a system that may handle thousands of concurrent conversations across a small number of agent types.

**Key architectural benefits**:
- **10 agents + 1,000 conversations = 10 topics** (not 1,000 or 2,000)
- **Consumer group isolation**: Each agent has a dedicated consumer group (e.g., `agent-{agentId}`), ensuring reliable message delivery without cross-agent interference
- **Agent-level ordering**: Total ordering of all events for an agent, useful for debugging and replay
- **Conversation filtering**: Simple predicate: `if (msg.conversation_id !== targetConversationId) continue;`

The minor overhead of filtering is negligible compared to the operational simplicity of not managing thousands of topics.

## Future Considerations

**Multi-agent conversations**: Currently TBD. For conversations with >2 agents, each agent would listen to all other participating agents' topics and filter by `conversation_id`. For N agents in a conversation, each agent consumes from N-1 topics.

**Scaling per agent** (FUTURE):

**Current implementation**: All topics use **1 partition**. Kafka records include partition key (`conversation_id`) for future compatibility, but partitioning is deferred.

**Future partition-based scaling**: If a single agent instance becomes overloaded (many conversations, high message rate), we can partition the agent's topic:

- Agent topic `conversational-agent-456` is created with N partitions (e.g., 4 partitions)
- Messages are partitioned by `conversation_id` (ensures all messages for a conversation go to the same partition)
- Consumer group `agent-conv-456` has N consumer instances (one per partition)
- Each agent instance handles 1 partition = subset of conversations
- Scaling: Add more partitions + more agent instances

**Example topology** (future):
```
Topic: conversational-agent-456 (4 partitions)
Consumer group: agent-conv-456

Agent instance 1 → Partition 0 → Conversations: conv-abc, conv-def, ...
Agent instance 2 → Partition 1 → Conversations: conv-ghi, conv-jkl, ...
Agent instance 3 → Partition 2 → Conversations: conv-mno, conv-pqr, ...
Agent instance 4 → Partition 3 → Conversations: conv-stu, conv-vwx, ...
```

**Key constraint**: All messages for a given `conversation_id` MUST go to the same partition (via consistent hashing). This ensures:
- Conversation message ordering is preserved
- A single agent instance maintains the conversation cache
- No cache coordination needed between instances

**Topic count scaling**: With agent-owned topics, the number of topics equals the number of unique agent instances. For systems with many ephemeral conversations but relatively few agent types, this provides excellent scaling characteristics.

**Advanced patterns**: For complex workflows (e.g., agent supervision, delegation, parallel processing), we may introduce meta-agents that consume multiple topics and implement orchestration logic at a higher level.
