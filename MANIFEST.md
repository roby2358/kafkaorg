# Manifest

> High-level roadmap for kafkaorg

## Vision

A Kafka-based orchestration platform for AI agents that enables dynamic, distributed agent ecosystems. Agents communicate asynchronously through Kafka topics, react to events, and collaborate on complex tasks. The platform supports self-organizing systems where agents can dynamically create new topics, spawn additional agents, and extend their capabilities through code generation. This creates a playground for exploring multi-agent coordination, distributed workflows, and emergent behaviors in agent-based systems.

## North Star Goal

Publish the kafkaorg-powered application to Bluesky as a long-form fiction generation service. Users can place orders, request services, and conduct transactions using "Astral Credits" (virtual currency, never real money). The kafkaorg platform provides the orchestration layer that enables agents to handle orders, coordinate fiction generation workflows, manage transactions, and deliver services—all through the distributed agent ecosystem running on Kafka.

## Current State

- Infrastructure: Kafka and PostgreSQL running in containers, accessible from host
- Basic UI: Python web app (FastAPI) for viewing organization state
- Foundation ready for agent development

## Roadmap

### Phase 1: Foundation
**Goal**: Prove basic agent-to-agent communication through Kafka

- Single agent that consumes from one topic and produces to another
- Simple record format (JSON)
- Validates Kafka integration works end-to-end

### Phase 2: Orchestration
**Goal**: Enable dynamic agent and topic management

- Meta-agent/orchestrator for creating topics and managing agents
- Agent registry and discovery
- Basic agent lifecycle (create, monitor, terminate)

### Phase 3: Dynamic Capabilities
**Goal**: Agents can extend themselves and others

- Code generation framework for agent tools
- Secure execution sandbox
- Tool discovery and registration system

### Phase 4: Production Readiness
**Goal**: Robust, observable, scalable system

- Multi-agent workflows and coordination
- Error handling and recovery
- Monitoring, observability, and debugging tools

## Key Principles

- **Kafka for events**: Records represent events flowing between agents
- **PostgreSQL for state**: Organization state (agents, topics, workflows) lives in the database
- **Decoupled agents**: Agents communicate asynchronously via Kafka topics
- **Dynamic ecosystem**: Agents can create topics, spawn new agents, generate code

## Technical Foundation

- Kafka: Event streaming and agent communication
- PostgreSQL: Organization state and metadata
- Python: Implementation language
- FastAPI: Web interface
- Containerized deployment (Podman/Docker)

---

*For detailed architecture notes, design considerations, and implementation details, see `PRODUCT_NOTES.md`*
