-- Database schema for kafkaorg
-- PostgreSQL schema definitions

-- User table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(32) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Agent table
CREATE TABLE IF NOT EXISTS agents (
    id SERIAL PRIMARY KEY,
    name VARCHAR(256) NOT NULL,
    topic VARCHAR(256) NOT NULL,
    model VARCHAR(256) NOT NULL,
    created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted TIMESTAMP,
    active BOOLEAN NOT NULL
);

-- Conversation table
CREATE TABLE IF NOT EXISTS conversations (
    id SERIAL PRIMARY KEY,
    description VARCHAR(1024) NOT NULL,
    user_id VARCHAR(32) REFERENCES users(id),
    agent_id INT NOT NULL REFERENCES agents(id),
    created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Messages are stored in Kafka topics, not in the database
