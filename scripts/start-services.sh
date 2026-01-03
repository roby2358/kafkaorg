#!/bin/bash
set -e

# Track Kafka process ID for graceful shutdown
KAFKA_PID=""

# Graceful shutdown handler
shutdown() {
  echo "Received shutdown signal, stopping services..."
  
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
if [ ! -d /var/lib/postgresql/14/main ]; then
  echo "Initializing PostgreSQL data directory..."
  sudo -u postgres /usr/lib/postgresql/14/bin/initdb -D /var/lib/postgresql/14/main
  echo "host all all 0.0.0.0/0 md5" >> /var/lib/postgresql/14/main/pg_hba.conf
  echo "listen_addresses='*'" >> /var/lib/postgresql/14/main/postgresql.conf
fi

# Start PostgreSQL
sudo -u postgres /usr/lib/postgresql/14/bin/pg_ctl -D /var/lib/postgresql/14/main -l /var/log/postgresql.log start

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

# Wait for Kafka process to exit
wait $KAFKA_PID
KAFKA_EXIT_CODE=$?

# If Kafka exited (not due to signal trap), clean up PostgreSQL
echo "Kafka exited with code $KAFKA_EXIT_CODE, stopping PostgreSQL..."
sudo -u postgres /usr/lib/postgresql/14/bin/pg_ctl -D /var/lib/postgresql/14/main stop -m fast || true

exit $KAFKA_EXIT_CODE
