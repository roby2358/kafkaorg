#!/bin/bash
set -e

# Track process IDs for graceful shutdown
KAFKA_PID=""
SERVER_PID=""

# Graceful shutdown handler
shutdown() {
  echo "Received shutdown signal, stopping services..."
  
  # Stop Express.js server if running
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "Stopping Express.js server..."
    kill -TERM "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  
  # Stop Kafka if running
  if [ -n "$KAFKA_PID" ] && kill -0 "$KAFKA_PID" 2>/dev/null; then
    echo "Stopping Kafka..."
    kill -TERM "$KAFKA_PID" 2>/dev/null || true
    wait "$KAFKA_PID" 2>/dev/null || true
  fi
  
  # Stop PostgreSQL
  echo "Stopping PostgreSQL..."
  sudo -u postgres /usr/lib/postgresql/14/bin/pg_ctl -D /var/lib/postgresql/14/main stop -m fast || true
  
  exit 0
}

# Set up signal handlers
trap shutdown SIGTERM SIGINT

# Initialize PostgreSQL data directory if needed
if [ ! -d /var/lib/postgresql/14/main ] || [ ! -f /var/lib/postgresql/14/main/postgresql.conf ]; then
  if [ -d /var/lib/postgresql/14/main ]; then
    echo "Data directory exists but postgresql.conf missing, reinitializing..."
    rm -rf /var/lib/postgresql/14/main/*
  else
    echo "Initializing PostgreSQL data directory..."
  fi
  sudo -u postgres /usr/lib/postgresql/14/bin/initdb -D /var/lib/postgresql/14/main
  echo "host all all 0.0.0.0/0 md5" >> /var/lib/postgresql/14/main/pg_hba.conf
  echo "listen_addresses='*'" >> /var/lib/postgresql/14/main/postgresql.conf
fi

# Start PostgreSQL (without log file to use default stderr logging)
sudo -u postgres /usr/lib/postgresql/14/bin/pg_ctl -D /var/lib/postgresql/14/main -w start

# Wait for PostgreSQL to be ready
until pg_isready -U postgres; do
  echo "Waiting for PostgreSQL..."
  sleep 1
done
echo "PostgreSQL is ready"

# Initialize database if needed
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';" 2>/dev/null || true
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='kafkaorg'" | grep -q 1 || sudo -u postgres createdb kafkaorg

# Generate server.properties from template with environment variable substitution
KAFKA_ADVERTISED_HOST=${KAFKA_ADVERTISED_HOST:-localhost}
export KAFKA_ADVERTISED_HOST
envsubst < ${KAFKA_HOME}/config/kraft/server.properties.template > ${KAFKA_HOME}/config/kraft/server.properties
echo "Configured Kafka advertised.listeners to PLAINTEXT://${KAFKA_ADVERTISED_HOST}:9092"

# Format Kafka storage for KRaft mode (only if not already formatted)
if [ ! -f /tmp/kafka-logs-metadata/meta.properties ]; then
  echo "Formatting Kafka storage for KRaft mode..."
  KAFKA_CLUSTER_ID=$(${KAFKA_HOME}/bin/kafka-storage.sh random-uuid)
  ${KAFKA_HOME}/bin/kafka-storage.sh format -t $KAFKA_CLUSTER_ID -c ${KAFKA_HOME}/config/kraft/server.properties
  echo "Kafka storage formatted with cluster ID: $KAFKA_CLUSTER_ID"
else
  echo "Kafka storage already formatted, skipping..."
fi

# Start Kafka in KRaft mode (background so we can track PID)
${KAFKA_HOME}/bin/kafka-server-start.sh ${KAFKA_HOME}/config/kraft/server.properties &
KAFKA_PID=$!
echo "Kafka started with PID $KAFKA_PID"

# Set DATABASE_URL for Express.js (everything runs in same container, so use localhost)
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/kafkaorg"

# PORT is set in Dockerfile (8822 for container, defaults to 8821 for local dev)
SERVER_PORT=${PORT:-8821}

# Start Express.js server
cd /app
echo "Starting Express.js server on port $SERVER_PORT..."
node dist/index.js &
SERVER_PID=$!
echo "Express.js server started with PID $SERVER_PID on port $SERVER_PORT"

# Wait for any process to exit
wait -n
EXIT_CODE=$?

# If any process exited (not due to signal trap), clean up
echo "A service exited with code $EXIT_CODE, stopping all services..."
shutdown
exit $EXIT_CODE
