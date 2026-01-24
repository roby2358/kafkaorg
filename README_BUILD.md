# Building and Deploying Kafkaorg

This guide covers building the Docker image, local development setup, and deploying to registries.

## Building and Deploying the Docker Image

### Building with Podman Compose

The simplest way to build the image is with `podman compose`, which automatically builds the image when you run:

```bash
podman compose up -d
```

To rebuild the image after code changes:

```bash
podman compose build
```

To force a rebuild without cache:

```bash
podman compose build --no-cache
```

### Building Manually

Build the Docker image manually with Podman:

```bash
podman build -t kafkaorg:latest .
```

Build with a specific tag:

```bash
podman build -t kafkaorg:v1.0.0 .
```

Build without using cache (clean build):

```bash
podman build --no-cache -t kafkaorg:latest .
```

### Running the Image Manually

Run the container manually (without compose):

```bash
podman run -d \
  --name kafkaorg \
  -p 5432:5432 \
  -p 9092:9092 \
  -p 9093:9093 \
  -p 8822:8822 \
  -e KAFKA_ADVERTISED_HOST=localhost \
  -v kafkaorg-data:/var/lib/postgresql/14/main \
  -v kafkaorg-kafka-logs:/tmp/kafka-logs \
  -v kafkaorg-kafka-metadata:/tmp/kafka-logs-metadata \
  kafkaorg:latest
```

View logs from the manually run container:

```bash
podman logs -f kafkaorg
```

Stop and remove the manually run container:

```bash
podman stop kafkaorg
podman rm kafkaorg
```

### Deploying to a Registry

Tag the image for a registry:

```bash
# Docker Hub
podman tag kafkaorg:latest yourusername/kafkaorg:latest

# GitHub Container Registry
podman tag kafkaorg:latest ghcr.io/yourusername/kafkaorg:latest

# Private registry
podman tag kafkaorg:latest registry.example.com/kafkaorg:latest
```

Push the image to a registry:

```bash
# Docker Hub
podman push yourusername/kafkaorg:latest

# GitHub Container Registry
podman push ghcr.io/yourusername/kafkaorg:latest

# Private registry
podman push registry.example.com/kafkaorg:latest
```

Pull and run from a registry:

```bash
podman pull yourusername/kafkaorg:latest
podman compose up -d
```

## Local Development Setup

If you want to develop the web server locally instead of in the container:

### Prerequisites

- Node.js 18+ installed
- pnpm installed (`npm install -g pnpm`)
- Podman 5.7.0+ installed and running (for PostgreSQL and Kafka)

### Setup

1. Start the containerized services (PostgreSQL and Kafka):
```bash
podman compose up -d
```

2. Install dependencies:
```bash
pnpm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```
Edit `.env` to point to the containerized database: `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/kafkaorg"`

4. Generate Prisma client:
```bash
pnpm prisma:generate
```

### Development

Start the Express.js backend server:

```bash
pnpm dev
```

The server will start at `http://localhost:8821` with auto-reload enabled for development.

### Common Development Commands

```bash
# Install dependencies
pnpm install

# Generate Prisma client
pnpm prisma:generate

# Run database migrations
pnpm prisma:migrate

# Open Prisma Studio (database GUI)
pnpm prisma:studio

# Seed database
pnpm prisma:seed

# Build production bundle
pnpm build

# Start production server
pnpm start

# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch
```

### Regenerating the Command Parser

The command parser (`src/bash/command_parser.js`) is generated from the PEG grammar. To regenerate after editing the grammar:

```bash
npx peggy --format es -o src/bash/command_parser.js src/bash/command.pegjs
```
