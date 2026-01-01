# Product Notes: Kafkaorg

## Project Vision
A Kafka-based orchestration platform for AI agents that enables dynamic, distributed agent ecosystems where agents can communicate, create new agents, and extend their own capabilities through code generation.

## Terminology
**Records** in Kafka represent **events** in the system. Agents consume records (events) from topics, process them, and produce new records (events) to topics. This document uses "records" (Kafka's technical term) to refer to the data units flowing through the system, while conceptually these records represent events that agents react to.

## Kafka Architecture Basics

**Kafka is NOT a database wrapper** - it's its own storage system:
- **Direct disk storage**: Kafka stores records directly to disk files (log-structured storage)
- **No database underneath**: Kafka manages its own file-based storage optimized for sequential I/O
- **Partition-based**: Topics are divided into partitions, each stored as a log file on disk
- **Not a database**: Kafka lacks features like SQL queries, secondary indexes, ACID transactions
- **Optimized for streaming**: Designed for high-throughput sequential writes/reads, not random access

**Kafka vs Database:**
- **Kafka**: Optimized for streaming, high-throughput, sequential access, event log
- **Database**: Optimized for queries, indexes, transactions, random access, current state
- **They complement each other**: Kafka for events/streaming, database for queries/state (which is exactly what kafkaorg does!)

## Why Kafka? Key Value Propositions

**High Throughput & Low Latency**
- Can handle millions of records per second with sub-10ms latency
- Critical for real-time agent communication and event-driven architectures
- Enables agents to react to events as they happen, not in batch

**Scalability**
- Horizontal scaling: Add more brokers to handle more load
- Partitioning: Distribute load across multiple machines
- Consumer groups: Scale consumers to process more records in parallel
- For kafkaorg: Can scale from a few agents to thousands without architectural changes

**Durability & Reliability**
- Records are persisted to disk (not just in-memory)
- Replication across multiple brokers prevents data loss
- Fault tolerance: System continues operating if brokers fail
- For kafkaorg: Agent work won't be lost if a component crashes

**Decoupling & Flexibility**
- Producers and consumers are completely decoupled (don't know about each other)
- Multiple consumers can process the same records independently
- Easy to add new agents without modifying existing ones
- For kafkaorg: Agents can be added/removed dynamically without breaking the system

**Replay Capability**
- Consumers can re-read records from any point in time (within retention)
- Useful for debugging, reprocessing, or catching up after downtime
- For kafkaorg: Can replay events to understand what happened or recover from errors

**Ordering Guarantees**
- Records within a partition are ordered (FIFO)
- Critical for maintaining causality in distributed systems
- For kafkaorg: Ensures agent actions happen in the correct sequence

**Real-Time Stream Processing**
- Kafka Streams API enables processing records as they arrive
- Can do aggregations, transformations, joins on the fly
- For kafkaorg: Could process agent workflows in real-time

**Ecosystem & Integration**
- Large ecosystem of connectors and tools
- Integrates with databases, data lakes, monitoring systems
- For kafkaorg: Easy to connect to LangGraph, databases, UIs, etc.

**Bottom line for kafkaorg**: Kafka provides a robust, scalable, durable event bus that enables agents to communicate asynchronously, scale independently, and maintain reliability even as the system grows.

## Architecture Considerations

### Core Components
1. **Agent Runtime**: Each agent needs a Kafka consumer/producer client, LangGraph state management, and tool execution environment
2. **Orchestrator/Meta-Agent**: Manages agent lifecycle, topic creation, and agent-to-topic assignments
3. **Code Execution Sandbox**: Secure environment for dynamically generated agent tools
4. **Record Schema Registry**: Standardized record formats for agent communication
5. **Organization State Database (PostgreSQL)**: PostgreSQL database that represents the current state of the organization (agents, topics, workflows, etc.)
   - PostgreSQL chosen for: ACID transactions, SQL queries, relational data model, reliability, ecosystem support

### Key Design Questions

**Record Format**
- What schema do records follow? (JSON, Avro, Protobuf?)
- How do agents discover record schemas for topics they subscribe to?
- Should records include metadata like source agent, timestamp, correlation IDs?

**Agent Lifecycle**
- How are agents registered/discovered?
- What happens when an agent crashes or becomes unresponsive?
- How do agents declare their capabilities/required topics?

**Dynamic Topic Management**
- Who has permission to create topics? (All agents? Only orchestrator?)
- How are topic namespaces organized? (per-agent, per-workflow, global?)
- What about topic cleanup when agents terminate?

**Code Generation & Execution**
- Security model for executing dynamically generated code
- Language support? (Python only? Multi-language?)
- How do agents discover available tools?
- Versioning for generated tools?

**State Management and Event Logging**

**PostgreSQL as Source of Truth:**
- **PostgreSQL = source of truth**: Current state lives in PostgreSQL (agents, topics, workflows, etc.)
- **Kafka records = event log/audit trail**: Records represent events that happened and serve as:
  - Communication mechanism between agents (event-driven communication)
  - Audit trail showing how the system got to its current state
  - Integration/notification mechanism
- **Flow**: Agents update PostgreSQL directly, then emit events to Kafka for other agents to react to
- **Benefits**: 
  - Simple mental model (PostgreSQL is authoritative)
  - Fast queries (direct SQL access, indexes)
  - Clear current state
  - ACID transactions for consistency
  - Events serve as communication and audit trail
- **For kafkaorg:**
  - PostgreSQL holds current organization state (agents, topics, assignments) - this is what you query for "what agents exist right now"
  - Kafka records are the communication mechanism between agents (work in flight, events to react to)
  - Records also serve as audit trail of how organization state evolved
  - Agents can query PostgreSQL for current state, react to Kafka events for work
  - This aligns with how Kafka is most commonly used in production systems

**Kafka Features to Leverage**
- **Consumer Groups**: For agent scaling and load distribution
- **Partitioning**: For parallel processing and ordering guarantees
- **Transactions**: For atomic multi-topic operations
- **Schema Registry**: For record evolution and compatibility
- **Kafka Streams**: For stateful processing and aggregations
- **Connect API**: For integrating with external systems

**Data Retention Policies**
Kafka records are retained based on configurable policies (set globally or per-topic):
- **Time-based retention** (default: 7 days / 168 hours):
  - `log.retention.hours`: How long records are kept before deletion
  - `log.retention.ms`: More granular time control
  - Old records are deleted when retention time expires
- **Size-based retention**:
  - `log.retention.bytes`: Maximum log size before old segments deleted
  - Default: `-1` (unlimited size)
- **Cleanup policies**:
  - `delete`: Default - delete old records when retention limits hit
  - `compact`: Keep latest record per key, delete older records with same key (useful for key-value state)
  - `delete,compact`: Combine both policies
- **Archiving to permanent storage**:
  - **Financial/compliance systems**: Often archive Kafka logs to permanent storage (S3, HDFS, data lakes) for regulatory compliance
  - **Retention requirements**: Financial systems may need 7+ years of data (SOX, GDPR, etc.) - Kafka retention alone insufficient
  - **Archiving strategies**:
    - Periodic export of Kafka logs to external storage
    - Kafka Connect to stream to archival systems
    - Tiered storage (recent data in Kafka, older data in cold storage)
  - **Benefits**: Compliance, auditability, while keeping Kafka performant with shorter retention
- **Implications for kafkaorg**:
  - Work-in-flight records: May want shorter retention (hours/days) since they're transient
  - Audit trail records: May want longer retention (weeks/months) or archive to permanent storage
  - Organization state events: Could use compaction if events update the same entity (e.g., agent status updates)
  - Consider: If database is source of truth, shorter Kafka retention may be acceptable (database holds history)
  - For compliance/audit: May need to archive Kafka logs even if database is source of truth (complete event log)

**User Interface & Observability**
- Kafka does not provide a built-in UI, but several options exist:
  - **Built-in CLI tools**: `kafka-console-consumer`, `kafka-console-producer`, `kafka-topics` (useful for dev/debug)
  - **Third-party tools**: Kafdrop, Kafka UI (by provectus), Conduktor, Kafka Tool, CMAK
- **Custom UI considerations for kafkaorg**:
  1. **Record monitoring**: View records (events) flowing through topics in real-time
  2. **Agent dashboard**: Monitor agent status, health, and which topics they're listening to
  3. **Agent management**: Create/configure agents, assign topics, manage lifecycle
  4. **Workflow visualization**: See agent-to-agent record flows and dependencies
  5. **Code generation interface**: Manage generated tools/code, view execution history
- Decision needed: Use existing tool (e.g., Kafdrop for Phase 1) vs. build custom UI

## Implementation Phases

### Phase 1: Foundation
- Basic agent that can consume/produce to Kafka topics
- Simple record format (JSON)
- Single agent type with hardcoded behavior

### Phase 2: Orchestration
- Meta-agent for topic creation and agent management
- Agent registry/discovery mechanism
- Basic lifecycle management

### Phase 3: Dynamic Capabilities
- Code generation framework
- Sandboxed execution environment
- Tool discovery and registration

### Phase 4: Advanced Features
- Multi-agent workflows
- State management across agent interactions
- Monitoring and observability
- Error handling and recovery

## Technical Challenges

1. **Security**: Executing arbitrary code generated by agents requires robust sandboxing
2. **State Management**: How to maintain LangGraph state across Kafka record boundaries
3. **Error Handling**: What happens when an agent fails mid-processing? Dead letter queues?
4. **Testing**: How to test distributed agent interactions?
5. **Debugging**: Observability into agent decision-making and record flows

## Potential Use Cases
- Multi-agent research/experimentation
- Distributed task processing pipelines
- Self-organizing agent systems
- Agent marketplace/platform

## Questions to Resolve
- Should agents be long-lived processes or event-driven functions?
- How do we handle agent versioning and updates?
- What's the relationship between LangGraph workflows and Kafka topics?
- Should there be a central coordinator or fully decentralized?

---

## Appendix: Considered Alternatives

This section documents alternatives that were considered but not chosen, for reference and future consideration.

### Alternative: Event Sourcing Pattern
- **Approach**: Kafka records as source of truth, PostgreSQL as materialized view derived from events
- **Why not chosen**: More complex, requires event replay logic, adds latency for state queries
- **When it might make sense**: If complete event history and ability to rebuild state at any point becomes critical requirement
- **Status**: Not chosen - PostgreSQL as source of truth is simpler and sufficient
