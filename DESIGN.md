# Design: kafkaorg

## High-Level Architecture

kafkaorg is a minimal Kafka-based orchestration system with the following components:

### Core Components

1. **Kafka**
   - Event streaming platform
   - Manages topics and record flow
   - Handles producer/consumer communication

2. **Hello→World Topic Pipeline**
   - Simple pipeline demonstrating record flow
   - Consumes from `hello` topic, produces to `world` topic
   - Validates the basic Kafka integration

3. **PostgreSQL Database**
   - Stores organization state
   - Single table initially (organization metadata)
   - Source of truth for current system state

4. **UI (FastAPI + HTMX)**
   - Web interface for viewing organization state
   - FastAPI backend serving API endpoints
   - HTMX frontend for dynamic updates
   - Displays current state from PostgreSQL

5. **Docker/Podman Container**
   - Single container image bundling all components
   - Includes Kafka, PostgreSQL, pipeline, and UI
   - Self-contained deployment unit

## Data Flow

1. Records flow through Kafka topics (hello → world pipeline)
2. Pipeline processes records and updates organization state
3. PostgreSQL maintains current organization state
4. UI queries PostgreSQL to display current state
5. All components run within a single container

## Deployment

All components are bundled into a single Docker/Podman image for simplified deployment and execution.
