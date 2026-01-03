-- Database schema for kafkaorg
-- PostgreSQL schema definitions

-- User table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    created TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index on username for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
