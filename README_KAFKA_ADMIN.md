# Kafka Administration

## Kafka Commands

List all topics:
```bash
podman exec kafkaorg_kafkaorg_1 /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list
```

Watch messages on a topic (live):
```bash
podman exec kafkaorg_kafkaorg_1 /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic conv-1
```

Watch messages from the beginning:
```bash
podman exec kafkaorg_kafkaorg_1 /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic conv-1 --from-beginning
```

Delete a topic:
```bash
podman exec kafkaorg_kafkaorg_1 /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --delete --topic conv-1
```

## Clearing Kafka Data

**Clear a single conversation** (delete topic - it will be recreated when messages are sent):
```bash
podman exec kafkaorg_kafkaorg_1 /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --delete --topic conv-1
```

**Clear all data** (Kafka and Postgres - nuclear option):
```bash
podman compose down -v
podman compose up -d
```
The `-v` flag removes volumes, wiping all persisted data.

**Restart containers** (keeps data):
```bash
podman compose down
podman compose up -d
```
