# Kafkaorg Database Schema

## Overview

PostgreSQL database accessed via Prisma ORM.

---

## Current Tables

### users

Stores user accounts.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | VARCHAR(32) | PK, UNIQUE | Username / unique user identifier |
| name | VARCHAR(255) | NOT NULL | Display name |
| created | TIMESTAMP | NOT NULL, DEFAULT now() | When the user was created |
| updated | TIMESTAMP | NOT NULL, auto-updated | Last modification time |

---

## Planned Tables

### agents

Stores AI agent definitions. Agent lifecycle is tied to its topic.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PK, auto-increment | Unique agent identifier |
| name | VARCHAR(256) | NOT NULL | Agent name |
| topic | VARCHAR(256) | NOT NULL | Kafka topic this agent services |
| created | TIMESTAMP | NOT NULL, DEFAULT now() | When the agent was created |
| updated | TIMESTAMP | NOT NULL, auto-updated | Last modification time |
| deleted | TIMESTAMP | NULLABLE | Soft delete timestamp |
| active | BOOLEAN | NOT NULL | Whether the agent is active |

### conversations

Stores conversation sessions. Conversation owns the topic lifecycle.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PK, auto-increment | Unique conversation identifier |
| description | VARCHAR(1024) | NOT NULL | Conversation description |
| topic | VARCHAR(256) | NOT NULL | Kafka topic for this conversation |
| user_id | VARCHAR(32) | FK → users, NULLABLE | User who owns the conversation |
| agent_id | INT | FK → agents, NULLABLE | Agent who owns the conversation |
| created | TIMESTAMP | NOT NULL, DEFAULT now() | When the conversation was created |
| updated | TIMESTAMP | NOT NULL, auto-updated | Last modification time |

---

## Relationships

```
users
  └── conversations (user_id)

agents
  └── conversations (agent_id)
```

---

## Notes

- **User ID is a string**: Using VARCHAR(32) for human-readable usernames as primary key. May migrate to UUID/int later.
- **Messages stored in Kafka**: Conversation messages are stored in Kafka topics, not in the database.
- **Soft deletes on agents**: Use `deleted` timestamp rather than hard delete.
