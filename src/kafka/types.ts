// Kafka message types for Kafkaorg

export interface ConversationMessage {
  conversation_id: string;  // UUID
  user_id: string | null;
  agent_id: string | null;  // Agent instance ID (e.g., "conversational-agent-abc123")
  message: string;
  timestamp: string;  // ISO 8601
  command?: string[];  // Parsed command for tool execution (optional)
  correlation_id?: string;  // For async request-reply matching (optional)
}
