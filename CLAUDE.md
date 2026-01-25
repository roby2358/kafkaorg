# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Kafkaorg is a Kafka-based orchestration platform for AI agents that enables dynamic, distributed agent ecosystems. Agents communicate asynchronously through Kafka topics, react to events, and collaborate on complex tasks. The system is containerized with Kafka, PostgreSQL, and an Express.js web server all running together.

**Technology Stack:**
- **Backend:** TypeScript + Express.js + Node.js 18+
- **Database:** PostgreSQL (via Prisma ORM)
- **Message Broker:** Kafka (KafkaJS)
- **Container Runtime:** Podman/Docker
- **Package Manager:** pnpm
- **Testing:** Vitest

## Common Development Commands

### Container Management
```bash
# Start all services (PostgreSQL, Kafka, web server in container)
podman compose up -d

# View container logs
podman compose logs -f

# Stop services
podman compose down

# Stop and remove all data
podman compose down -v
```

### Local Development
```bash
# Install dependencies
pnpm install

# Generate Prisma client (required before development)
pnpm prisma:generate

# Start development server (port 8821)
pnpm dev

# Build production bundle
pnpm build

# Start production server
pnpm start
```

### Database Management
```bash
# Generate Prisma client
pnpm prisma:generate

# Run database migrations
pnpm prisma:migrate

# Open Prisma Studio (database GUI)
pnpm prisma:studio

# Seed database
pnpm prisma:seed
```

**Important:** No database migrations for now. When schema changes, rebuild the database from scratch.

### Testing
```bash
# Run all tests once
pnpm test

# Run tests in watch mode
pnpm test:watch
```

### Command Parser
The bash command parser is generated from a PEG grammar. To regenerate after editing the grammar:
```bash
npx peggy --format es -o src/bash/command_parser.js src/bash/command.pegjs
```
## Specifications

Technical specifications are maintained in `SPEC*.md` files:
- **SPEC_AGENT_COMMUNICATIONS.md**: Agent communication protocol via Kafka and docmem
- **SPEC_DOCMEM.md**: Complete docmem specification
- **SPEC_DOCMEM_ATOMICITY.md**: Transaction and concurrency model for docmem
- **SPEC_DOCMEM_SERIALIZATION.md**: Docmem serialization format and behavior
- **SPEC_COMMAND_PARSER.md**: Bash parser specification (in src/bash/)

**Important**: The SPEC*.md files are work products, not just documentation. They are maintained alongside the code and have equal importance. After the initial code implementation, specifications may drift out of sync with actual code changes. When making significant changes to the codebase, updating the corresponding specification documents is part of the work - not optional. The specs define what the system should do, while the code defines how it does it. Both must be kept in sync as the project evolves.

**Writing Guidelines**: When creating or updating SPEC*.md files, follow the guidelines in `.skills/specification/SKILL.md`. Key principles:
- Use RFC 2119 keywords (MUST, SHOULD, MAY) for requirement levels
- Focus on **what** the system does, not **how** it's implemented
- Use bullet points, not hierarchical numbering
- Include ASCII diagrams for UI/architecture layout
- Keep language high-level and implementation-agnostic
- Document error conditions and edge cases
- All MUST requirements should be testable
- 
## Architecture

### Core System Flow

1. **Web Server (Express.js)** - HTTP API and WebSocket server for UI communication
2. **Kafka Agents** - In-process consumers that listen to topics and process messages
3. **PostgreSQL** - Stores users, agents, conversations, and message content (via docmem)
4. **Kafka Topics** - Provide message sequencing and event ordering; content lives in docmem
5. **WebSocket Handler** - Bidirectional communication between UI and agents

### Key Components

**`src/index.ts`** - Application entry point. Initializes database, starts Express server, sets up WebSocket connections, and handles graceful shutdown.

**`src/kafka/agent.ts`** - Kafka agent implementation. Each agent:
- Owns a single Kafka topic with multiplexed conversations
- Consumes from its own topic, filters by conversation_id and agent_id
- Fetches message content from docmem (PostgreSQL)
- Maintains conversation history caches per conversation
- Uses OpenRouter API to generate responses
- Executes tools via the interpreter
- Produces responses back to the same topic

**`src/interpreter.ts`** - Tool execution layer. Processes agent responses, parses structured commands (speak, thought, action), and executes tools.

**`src/docmem_tools/`** - Document memory system. Hierarchical tree structure for agent memory:
- `docmem.ts` - Core node and tree operations
- `docmem_postgres.ts` - PostgreSQL backend implementation
- `docmem_tools.ts` - Tool implementations for docmem operations
- `docmem_tools_prompt.ts` - System prompt for docmem tools
- Implements optimistic locking with hash-based versioning
- Nodes have context metadata (type, name, value) for semantic organization

**`src/bash/`** - Bash-like command interpreter:
- `command.pegjs` - PEG grammar for command parsing
- `command_parser.js` - Generated parser (do not edit directly)
- `interpreter.ts` - Command execution logic
- Supports quoting, escaping, multiline strings (see SPEC_COMMAND_PARSER.md)

**`src/websocket/conversation-handler.ts`** - WebSocket connection management. Routes user messages to Kafka topics and streams agent responses back to UI.

**`src/routes/`** - Express API routes:
- `api/agents.ts` - Agent management (list, create, soft delete)
- `api/conversation.ts` - Conversation CRUD operations
- `api/user-message.ts` - Message submission endpoint
- `api/docmem.ts` - Docmem operations (TOML export/import)
- `api/signin.ts`, `api/signup.ts` - User authentication

**`src/db/`** - Database layer:
- `client.ts` - PostgreSQL connection pool management
- `init-schema.ts` - Schema initialization from SQL files

**`src/agents/OpenRouterAPI.ts`** - OpenRouter API client for LLM inference.

### Database Schema

**users** - User accounts (username is primary key, VARCHAR(32))

**agents** - AI agent definitions:
- Each agent owns a Kafka topic
- `model` field specifies OpenRouter model (e.g., "anthropic/claude-haiku-4.5")
- `active` boolean controls whether agent is running
- Soft delete via `deleted` timestamp

**conversations** - Conversation sessions:
- Links user + agent (via foreign keys)
- Message content stored in docmem (PostgreSQL), Kafka provides sequencing

### Docmem System

Docmem is a hierarchical document memory system for agents. Key concepts:

- **Nodes** form a tree structure with parent-child relationships
- **Context metadata** (type, name, value) differentiates node roles without explicit type fields
- **Optimistic locking** via SHA-512 hashes prevents concurrent modification conflicts
- **Readonly nodes** protect imported content from modification
- **Token counting** tracks context budget (approximation: characters / 4)
- **Serialization** traverses tree to construct linear documents

See SPEC_DOCMEM.md and SPEC_DOCMEM_ATOMICITY.md for complete specifications.

### Agent Communication Pattern

1. User sends plain text via WebSocket
2. UI agent creates docmem node with context `text:agent:ui-{id}` and message content
3. UI agent produces Kafka record (JSON) to conversational agent's topic with node reference
4. Conversational agent consumes record, fetches node content from docmem
5. Conversational agent builds message list (role-relative perspective), calls OpenRouter API
6. Conversational agent creates response node with context `text:agent:conv-{id}`
7. Conversational agent produces Kafka record back to same topic
8. UI agent consumes response, fetches content, streams plain text to WebSocket

**Key architecture**: Kafka provides sequencing, docmem provides content, agents maintain cached message lists. See SPEC_AGENT_COMMUNICATIONS.md for details.

### System Prompts

Agents receive system prompts from `src/system_prompts/`:
- `conversation.ts` - Base conversation behavior and tool execution

Tool-specific prompts are maintained alongside their implementations:
- `src/docmem_tools/docmem_tools_prompt.ts` - Document memory operations
- System and bash tools are defined in their respective modules

## Service Endpoints

**Container Web Server:** http://localhost:8822
**Local Dev Server:** http://localhost:8821
**PostgreSQL:** localhost:5432 (postgres/postgres/kafkaorg)
**Kafka:** localhost:9092
**WebSocket:** ws://localhost:8821/ws (or 8822 in container)

## Development Guidelines

### TypeScript Configuration
- Target: ES2022
- Module: ES2022
- Strict mode enabled
- Source maps and declarations generated
- No unused locals/parameters allowed

### Code Organization
- Use ES modules (import/export)
- Follow existing patterns for consistency
- Keep business logic in dedicated modules
- Route handlers should be thin wrappers

### Testing
- Tests in `test/**/*.test.ts`
- Use Vitest with 10s timeout
- Test critical business logic and edge cases

### Error Handling
- Graceful shutdown on SIGINT/SIGTERM
- Close resources in order: HTTP → WebSocket → Agents → Kafka → Database
- Validate input with Zod schemas (see `src/middleware/validation.ts`)

## Important Files to Reference

- **SPEC_AGENT_COMMUNICATIONS.md** - Agent communication protocol via Kafka and docmem
- **SPEC_DOCMEM.md** - Complete docmem specification
- **SPEC_DOCMEM_ATOMICITY.md** - Transaction and concurrency model
- **SPEC_COMMAND_PARSER.md** - Bash parser specification
- **DATABASE.md** - Database schema documentation
- **DESIGN.md** - High-level system architecture
- **MANIFEST.md** - Project roadmap and vision
- **README_BUILD.md** - Building and deployment guide
- **README_KAFKA_ADMIN.md** - Kafka administration commands
- **README_POSTGRES_ADMIN.md** - PostgreSQL administration

## Environment Variables

Key environment variables (see `.env`):
- `DATABASE_URL` - PostgreSQL connection string
- `OPENROUTER_API_KEY` - Required for agent responses
- `PORT` - Web server port (default: 8821 dev, 8822 container)

## Common Patterns

### Adding a New API Route
1. Create route handler in `src/routes/api/`
2. Import and register in `src/routes/index.ts`
3. Add Zod validation schema if needed
4. Follow existing patterns for error handling

### Creating a New Agent Tool
1. Add tool implementation to interpreter or dedicated module (e.g., `src/system_tools/`, `src/docmem_tools/`)
2. Create or update tool-specific prompt file alongside implementation
3. Register tool in the interpreter (`src/interpreter.ts`)
4. Test tool execution via agent conversation

### Modifying Database Schema
1. Update `db/schema.sql`
2. Rebuild database (no migrations)
3. Update Prisma schema if using Prisma for that table
4. Regenerate Prisma client: `pnpm prisma:generate`

### Working with Docmem
- Use docmem commands from agent system prompts
- Respect readonly flag on imported nodes
- Use optimistic locking (check hash) for updates
- Maintain tree structure integrity (no cycles)
