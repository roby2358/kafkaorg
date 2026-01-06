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
- Podman 5.7.0+ installed and running

## Starting Services

Start PostgreSQL and Kafka services:

```bash
podman compose up -d
```

This will:
- Build the container image (if not already built)
- Start the container with PostgreSQL and Kafka
- Expose ports to the host machine

## Service Endpoints

Once running, services are accessible from the host at:

- **Web Server (Container)**: `http://localhost:8822`
  - Main page: `http://localhost:8822/`
  - Signup page: `http://localhost:8822/signup`
  - API: `http://localhost:8822/api/*`

- **Web Server (Local Dev)**: `http://localhost:8821`
  - Runs when using `pnpm dev` for local development

- **PostgreSQL**: `localhost:5432`
  - User: `postgres`
  - Password: `postgres`
  - Database: `kafkaorg`

- **Kafka**: `localhost:9092`

## Running Everything

The container includes all services:
- **PostgreSQL** - Database
- **Kafka** - Message broker
- **Express.js Web Server** - API and static file serving

All services start automatically when the container starts. The web server is available at `http://localhost:8822`.

## Local Development (Optional)

If you want to develop the web server locally instead of in the container:

### Prerequisites
- Node.js 18+ installed
- pnpm installed (`npm install -g pnpm`)

### Setup

1. Install dependencies:
```bash
pnpm install
```

2. Set up environment variables:
```bash
cp .env.example .env
```
Edit `.env` to point to the containerized database: `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/kafkaorg"`

3. Generate Prisma client:
```bash
pnpm prisma:generate
```

### Development

Start the Express.js backend server:

```bash
pnpm dev
```

The server will start at `http://localhost:8821` with auto-reload enabled for development.

## Managing the Container

View logs:
```bash
podman compose logs -f
```

Stop services:
```bash
podman compose down
```

Stop and remove volumes (clears data):
```bash
podman compose down -v
```
