FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV KAFKA_VERSION=3.6.1
ENV SCALA_VERSION=2.13
ENV KAFKA_HOME=/opt/kafka
ENV PATH="${KAFKA_HOME}/bin:${PATH}"
ENV KAFKA_ADVERTISED_HOST=localhost

# Install dependencies
RUN apt-get update && apt-get install -y \
    openjdk-17-jdk \
    wget \
    curl \
    postgresql-14 \
    postgresql-contrib-14 \
    sudo \
    netcat-openbsd \
    gettext-base \
    && rm -rf /var/lib/apt/lists/*

# Install Kafka
RUN set -e && \
    (wget --progress=bar:force -O kafka.tgz https://downloads.apache.org/kafka/${KAFKA_VERSION}/kafka_${SCALA_VERSION}-${KAFKA_VERSION}.tgz || \
     wget --progress=bar:force -O kafka.tgz https://archive.apache.org/dist/kafka/${KAFKA_VERSION}/kafka_${SCALA_VERSION}-${KAFKA_VERSION}.tgz) && \
    tar -xzf kafka.tgz -C /opt && \
    mv /opt/kafka_${SCALA_VERSION}-${KAFKA_VERSION} ${KAFKA_HOME} && \
    rm kafka.tgz

# Configure Kafka KRaft mode
RUN mkdir -p /tmp/kafka-logs && \
    mkdir -p /tmp/kafka-logs-metadata && \
    mkdir -p /var/log/kafka

# Copy Kafka KRaft server.properties template
COPY config/server.properties.template ${KAFKA_HOME}/config/kraft/server.properties.template

# Copy startup script
COPY scripts/start-services.sh /start-services.sh
RUN chmod +x /start-services.sh

# Expose ports
EXPOSE 9092 5432 9093

# Healthcheck for both services
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD pg_isready -U postgres && nc -z localhost 9092 || exit 1

# Start all services
CMD ["/start-services.sh"]
