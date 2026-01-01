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
