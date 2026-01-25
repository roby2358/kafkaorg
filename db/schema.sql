-- Database schema for kafkaorg - Multi-agent architecture
-- PostgreSQL schema definitions

-- User table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(32) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Agent prototypes (templates/types)
-- Defines agent types like "ui-agent", "conversational-agent", "docmem-agent"
CREATE TABLE IF NOT EXISTS agent_prototypes (
    id SERIAL PRIMARY KEY,
    name VARCHAR(64) NOT NULL UNIQUE,  -- "ui-agent", "conversational-agent", etc.
    role VARCHAR(256) NOT NULL,  -- Human-readable description
    system_prompt TEXT NOT NULL,  -- System prompt for this agent type
    model VARCHAR(256) NOT NULL,  -- OpenRouter model (e.g., "anthropic/claude-haiku-4.5")
    created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Conversations (UUID-based)
CREATE TABLE IF NOT EXISTS conversations (
    id VARCHAR(36) PRIMARY KEY,  -- UUID
    user_id VARCHAR(32) REFERENCES users(id),
    description VARCHAR(1024),
    created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Agent instances (runtime agents)
-- Ephemeral agents spawned per conversation
CREATE TABLE IF NOT EXISTS agent_instances (
    id VARCHAR(128) PRIMARY KEY,  -- "ui-agent-{uuid}" or "conversational-agent-{uuid}"
    prototype_id INT NOT NULL REFERENCES agent_prototypes(id),
    conversation_id VARCHAR(36) NOT NULL REFERENCES conversations(id),
    status VARCHAR(16) NOT NULL DEFAULT 'running',  -- running, stopped, error
    created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    stopped TIMESTAMP
);

-- Topics (agent-to-agent communication channels)
-- Agent-owned topics with conversation multiplexing
-- Each conversational agent owns one topic, multiple conversations share it
CREATE TABLE IF NOT EXISTS topics (
    name VARCHAR(256) PRIMARY KEY,  -- "conversational-agent-{uuid}" (agent-owned)
    conversation_id VARCHAR(36) NOT NULL REFERENCES conversations(id),
    participant1_id VARCHAR(128) NOT NULL REFERENCES agent_instances(id),
    participant2_id VARCHAR(128) NOT NULL REFERENCES agent_instances(id),
    created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Message content is stored in docmem_nodes (PostgreSQL)
-- Kafka topics provide sequencing and event ordering only

-- Docmem nodes (hierarchical document memory)
CREATE TABLE IF NOT EXISTS docmem_nodes (
    id VARCHAR(32) PRIMARY KEY,
    parent_id VARCHAR(32) REFERENCES docmem_nodes(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    order_value DOUBLE PRECISION NOT NULL,
    token_count INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    context_type VARCHAR(24) NOT NULL,
    context_name VARCHAR(24) NOT NULL,
    context_value VARCHAR(24) NOT NULL,
    readonly INT NOT NULL DEFAULT 0,
    hash VARCHAR(128)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_agent_instances_conversation ON agent_instances(conversation_id);
CREATE INDEX IF NOT EXISTS idx_agent_instances_status ON agent_instances(status);
CREATE INDEX IF NOT EXISTS idx_topics_conversation ON topics(conversation_id);
CREATE INDEX IF NOT EXISTS idx_docmem_nodes_parent ON docmem_nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_docmem_nodes_parent_order ON docmem_nodes(parent_id, order_value);
