/**
 * Conversation Docmem Helper Functions
 *
 * Utilities for managing conversation docmems with the text:agent:{agentId} pattern.
 */

import { Docmem, Node } from './docmem.js';

/**
 * Message with role for LLM API
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Create a new conversation docmem with a blank root node
 */
export async function createConversationDocmem(conversationId: string): Promise<Docmem> {
  const docmem = new Docmem(conversationId);
  await docmem.ready();
  return docmem;
}

/**
 * Create a message node in the conversation docmem
 *
 * @param docmem - The conversation docmem instance
 * @param agentId - Agent ID for context (e.g., "ui-123", "conversational-456", "tool")
 * @param content - Plain text message content
 * @returns The created node
 */
export async function createMessageNode(
  docmem: Docmem,
  agentId: string,
  content: string
): Promise<Node> {
  const rootNode = await docmem._getRoot();

  // Create node as child of root with context pattern: text:agent:{agentId}
  const node = await docmem.append_child(
    rootNode.id,
    'text',
    'agent',
    agentId,
    content
  );

  return node;
}

/**
 * Fetch a message node by ID
 *
 * @param docmem - The conversation docmem instance
 * @param nodeId - The node ID to fetch
 * @returns The node with content and context
 */
export async function fetchMessageNode(
  docmem: Docmem,
  nodeId: string
): Promise<Node | null> {
  return docmem.find(nodeId);
}

/**
 * Extract agent ID from node context metadata
 *
 * @param node - The docmem node
 * @returns The agent ID from context (e.g., "ui-123", "conversational-456", "tool")
 */
export function extractAgentId(node: Node): string | null {
  // Context pattern: text:agent:{agentId}
  if (node.contextType === 'text' && node.contextName === 'agent') {
    return node.contextValue;
  }
  return null;
}

/**
 * Build LLM message list from docmem nodes using role-relative perspective
 *
 * @param docmem - The conversation docmem instance
 * @param myAgentId - This agent's ID (used for role determination)
 * @param systemPrompt - Optional system prompt to prepend
 * @returns Array of messages for LLM API
 */
export async function buildMessageList(
  docmem: Docmem,
  myAgentId: string,
  systemPrompt?: string
): Promise<ChatMessage[]> {
  const messages: ChatMessage[] = [];

  // Add system prompt if provided
  if (systemPrompt) {
    messages.push({
      role: 'system',
      content: systemPrompt,
    });
  }

  // Get all child nodes of root (message nodes)
  const rootNode = await docmem._getRoot();
  const nodes = await docmem.serialize(rootNode.id);

  // Skip the root node (first element) and process children
  for (let i = 1; i < nodes.length; i++) {
    const node = nodes[i];
    const agentId = extractAgentId(node);

    if (!agentId) {
      console.warn(`Node ${node.id} has no agent context, skipping`);
      continue;
    }

    // Role-relative perspective:
    // If agent_id matches my ID → role=assistant (my own messages)
    // Otherwise → role=user (other agents, users, tools)
    const role = agentId === myAgentId ? 'assistant' : 'user';

    messages.push({
      role,
      content: node.text,
    });
  }

  return messages;
}

/**
 * Load an existing conversation docmem
 *
 * @param conversationId - The conversation docmem root ID
 * @returns The loaded docmem instance
 */
export async function loadConversationDocmem(conversationId: string): Promise<Docmem> {
  const docmem = new Docmem(conversationId);
  await docmem.ready();
  return docmem;
}
