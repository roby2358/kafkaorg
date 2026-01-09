// Kafka message types for Kafkaorg

export interface ConversationMessage {
  conversation_id: number;
  user_id: string | null;
  agent_id: number | null;
  message: string;
  timestamp: string;
}
