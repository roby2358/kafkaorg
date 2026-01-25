// Kafka module exports

export { createTopic, deleteTopic, getProducer, closeKafka } from './client.js';
// Old agent implementation - replaced by BaseAgent, UIAgent, ConversationalAgent
// export { Agent, getAgent, registerAgent, unregisterAgent, stopAllAgents, getAllAgents, isAgentRunning } from './agent.js';
export type { ConversationMessage } from './types.js';
