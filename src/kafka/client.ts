// Kafka client for Kafkaorg

import { Kafka, Admin, Producer } from 'kafkajs';

const KAFKA_BROKERS = process.env.KAFKA_BROKERS || 'localhost:9092';

const kafka = new Kafka({
  clientId: 'kafkaorg',
  brokers: KAFKA_BROKERS.split(','),
});

let admin: Admin | null = null;
let producer: Producer | null = null;

export async function getAdmin(): Promise<Admin> {
  if (!admin) {
    admin = kafka.admin();
    await admin.connect();
    console.log('Kafka admin connected');
  }
  return admin;
}

export async function getProducer(): Promise<Producer> {
  if (!producer) {
    producer = kafka.producer();
    await producer.connect();
    console.log('Kafka producer connected');
  }
  return producer;
}

export async function createTopic(topic: string): Promise<void> {
  const adminClient = await getAdmin();
  
  const existingTopics = await adminClient.listTopics();
  if (existingTopics.includes(topic)) {
    console.log(`Topic ${topic} already exists`);
    return;
  }
  
  await adminClient.createTopics({
    topics: [{ topic, numPartitions: 1, replicationFactor: 1 }],
  });
  console.log(`Created topic: ${topic}`);
}

export async function deleteTopic(topic: string): Promise<void> {
  const adminClient = await getAdmin();
  await adminClient.deleteTopics({ topics: [topic] });
  console.log(`Deleted topic: ${topic}`);
}

export function createConsumer(groupId: string) {
  return kafka.consumer({ groupId });
}

export async function closeKafka(): Promise<void> {
  if (producer) {
    await producer.disconnect();
    producer = null;
  }
  if (admin) {
    await admin.disconnect();
    admin = null;
  }
  console.log('Kafka connections closed');
}
