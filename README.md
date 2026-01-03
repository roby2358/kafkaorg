# kafkaorg
Kafka Organization Manager

Kafkaorg is intended to be a playground for orchestrating AI agents using kafka, langraph, and langagent

# Goals
Agents can:
- listen to topics, process the records, then put records into topics
- take advantage of the features of kafka
- spin up new topics with agents assigned to them
- write code tools for agents to execute
- write new agents

# Terminology
Records in Kafka represent events in the system. Agents consume records (events) from topics, process them, and produce new records (events) to topics.

# Usage

## Prerequisites
- Podman installed and running
- `podman-compose` installed (or use `podman compose` if using Podman 4.0+)

## Starting Services

Start PostgreSQL and Kafka services using podman-compose:

```bash
podman-compose up -d
```

Or with Podman 4.0+:
```bash
podman compose up -d
```

This will:
- Build the container image (if not already built)
- Start the container with PostgreSQL and Kafka
- Expose ports to the host machine

## Service Endpoints

Once running, services are accessible from the host at:

- **PostgreSQL**: `localhost:5432`
  - User: `postgres`
  - Password: `postgres`
  - Database: `kafkaorg`

- **Kafka**: `localhost:9092`

## Running the Backend

Start the FastAPI backend server:

```bash
uv run go
```

The server will start at `http://localhost:8821` with auto-reload enabled for development.

## Development

You can develop your web app on the host machine and connect to these services using the endpoints above. The services run in the container but are accessible from your local development environment.

## Managing the Container

View logs:
```bash
podman-compose logs -f
```

Stop services:
```bash
podman-compose down
```

Stop and remove volumes (clears data):
```bash
podman-compose down -v
```
