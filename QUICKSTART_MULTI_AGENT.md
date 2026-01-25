# Multi-Agent System - Quick Start

## Setup

### 1. Install Dependencies

```bash
pnpm install
```

This will install the new `uuid` package and types.

### 2. Rebuild Database

**WARNING**: This destroys all existing data!

```powershell
# On Windows (PowerShell)
./scripts/rebuild-database-multi-agent.ps1
```

Or manually:

```bash
# Drop and recreate database
podman exec kafkaorg_kafkaorg_1 psql -U postgres -c "DROP DATABASE IF EXISTS kafkaorg;"
podman exec kafkaorg_kafkaorg_1 psql -U postgres -c "CREATE DATABASE kafkaorg;"

# Apply schema
cat db/schema.sql | podman exec -i kafkaorg_kafkaorg_1 psql -U postgres -d kafkaorg

# Seed agent prototypes
cat db/seed_agent_prototypes.sql | podman exec -i kafkaorg_kafkaorg_1 psql -U postgres -d kafkaorg
```

### 3. Generate Prisma Client

```bash
pnpm prisma:generate
```

### 4. Replace Files

To activate the new system, replace the old files:

```bash
# WebSocket handler
mv src/websocket/conversation-handler.ts src/websocket/conversation-handler-old.ts
mv src/websocket/conversation-handler-new.ts src/websocket/conversation-handler.ts

# Conversation API route
mv src/routes/api/conversation.ts src/routes/api/conversation-old.ts
mv src/routes/api/conversation-new.ts src/routes/api/conversation.ts
```

### 5. Start the Server

```bash
# Container mode
podman compose up -d

# Or local development
pnpm dev
```

## Architecture

### Agent Types

1. **UI Agent** - WebSocket ↔ Kafka proxy
2. **Conversational Agent** - OpenRouter orchestrator
3. **Docmem Agent** - Tool executor (spawned on demand)

### Message Flow

```
User (browser)
  ↕ WebSocket
UI Agent
  ↕ topic: ui-agent-{id}-conversational-agent-{id}
Conversational Agent
  ↕ topic: conversational-agent-{id}-docmem-agent-{id}
Docmem Agent
```

## API Usage

### Create a Conversation

```bash
curl -X POST http://localhost:8821/api/conversations \
  -H "Content-Type: application/json" \
  -d '{"user_id": "alice", "description": "Test conversation"}'

# Response:
# {
#   "conversation_id": "abc-123-...",
#   "ui_agent_id": "ui-agent-xyz",
#   "conversational_agent_id": "conversational-agent-xyz"
# }
```

### WebSocket Connection

```javascript
const ws = new WebSocket('ws://localhost:8821/ws');

ws.onopen = () => {
  // Join conversation
  ws.send(JSON.stringify({
    type: 'join_conversation',
    conversation_id: 'abc-123-...'
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message);
};

// Send user message
ws.send(JSON.stringify({
  type: 'user_message',
  message: 'Create a docmem called test',
  user_id: 'alice'
}));
```

### List Conversations

```bash
curl http://localhost:8821/api/conversations?user_id=alice
```

## Testing the System

### 1. Create a User

```bash
curl -X POST http://localhost:8821/api/signup \
  -H "Content-Type: application/json" \
  -d '{"username": "alice", "password": "test123"}'
```

### 2. Create a Conversation

```bash
curl -X POST http://localhost:8821/api/conversations \
  -H "Content-Type: application/json" \
  -d '{"user_id": "alice", "description": "My first chat"}'
```

### 3. Connect via WebSocket

See WebSocket example above.

### 4. Send a Message with Tool Command

```javascript
ws.send(JSON.stringify({
  type: 'user_message',
  message: 'Create a docmem instance called project-notes',
  user_id: 'alice'
}));
```

Expected flow:
1. Conversational agent receives message
2. Calls OpenRouter API
3. LLM responds with # Run block containing `start-conversation docmem-agent`
4. Framework spawns docmem agent
5. Conversational agent sends `docmem-create project-notes` command
6. Docmem agent executes and returns result
7. Conversational agent formats response
8. UI agent sends to browser

## Debugging

### Check Database

```bash
# Connect to database
docker exec -it kafkaorg_kafkaorg_1 psql -U postgres -d kafkaorg

# View agent prototypes
SELECT * FROM agent_prototypes;

# View conversations
SELECT * FROM conversations;

# View agent instances
SELECT * FROM agent_instances;

# View topics
SELECT * FROM topics;
```

### View Logs

```bash
# Container logs
podman compose logs -f

# Or local dev logs
pnpm dev
```

### Monitor Kafka Topics

```bash
# List topics
docker exec kafkaorg_kafkaorg_1 kafka-topics.sh \
  --list --bootstrap-server localhost:9092

# Read from a conversation topic
docker exec kafkaorg_kafkaorg_1 kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic ui-agent-xxx-conversational-agent-yyy \
  --from-beginning
```

## Next Steps

1. **Test basic conversation** - Create conversation, send message, verify response
2. **Test tool execution** - Send message that triggers docmem commands
3. **Test multi-agent** - Verify docmem agent is spawned correctly
4. **Build UI** - Create a web interface to interact with agents
5. **Add more agents** - Bash agent, search agent, etc.

## Troubleshooting

**Problem**: "Agent prototype not found"
**Solution**: Run `db/seed_agent_prototypes.sql`

**Problem**: "OpenRouter API key not configured"
**Solution**: Set `OPENROUTER_API_KEY` in `.env`

**Problem**: "WebSocket connection not found"
**Solution**: Ensure agents are spawned before connecting WebSocket

**Problem**: Agents not responding
**Solution**: Check that Kafka is running and topics are created

## Architecture Documents

- `DESIGN_MULTI_AGENT.md` - Complete architecture explanation
- `IMPLEMENTATION_PLAN.md` - Implementation details and plan
- `SPEC_DOCMEM.md` - Docmem specification
