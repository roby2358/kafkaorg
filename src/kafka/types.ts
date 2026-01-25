// Kafka message types for Kafkaorg

export interface ConversationMessage {
  // Envelope metadata
  version: string;              // Format version (e.g., "1.0.0") for extensibility
  conversation_id: string;      // UUID identifying the conversation
  agent_id: string;             // ALWAYS the sender agent instance ID (e.g., "conversational-agent-abc123")
                                // Use agent_id="tool" for tool results
  timestamp: string;            // ISO 8601 timestamp
  correlation_id?: string;      // For async request-reply matching (optional)

  // Docmem references
  docmem_node_id: string;       // The conversation docmem root node ID
  node_id: string;              // The specific node ID for this message (the new content node)

  // Action semantics
  action: string;               // Operation type: "create", "append", "edit", "delete",
                                // "tool_invoke", "tool_result", "system_message"
                                // (loosely specified, extensible)

  // Legacy/compatibility
  command?: string[];           // Parsed command for tool execution (optional, kept for compatibility)
}
