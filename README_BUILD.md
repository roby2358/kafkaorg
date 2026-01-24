# Building and Deploying Kafkaorg

## Prerequisites

Install podman-compose:

```bash
uv tool install podman-compose
```

## Running with Containers

Start all services (PostgreSQL, Kafka, web server):

```bash
podman compose up -d
```

View logs:

```bash
podman compose logs -f
```

Stop services:

```bash
podman compose down
```

Rebuild after code changes:

```bash
podman compose build --no-cache
podman compose up -d
```

## Local Development

For developing the web server locally with containerized PostgreSQL and Kafka:

Install dependencies:

```bash
pnpm install
pnpm prisma:generate
```

Start development server:

```bash
pnpm dev
```

The server runs at `http://localhost:8821` with auto-reload enabled.

## Common Commands

```bash
# Database
pnpm prisma:generate    # Generate Prisma client
pnpm prisma:studio      # Open database GUI
pnpm prisma:seed        # Seed database

# Testing
pnpm test               # Run tests
pnpm test:watch         # Run tests in watch mode

# Build
pnpm build              # Build production bundle
pnpm start              # Start production server

# Parser
npx peggy --format es -o src/bash/command_parser.js src/bash/command.pegjs
```
