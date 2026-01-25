// WebSocket handler for conversation messages

import { WebSocket, WebSocketServer } from 'ws';
import { Server } from 'http';
import { orchestrationFramework } from '../orchestration/framework.js';
import { prisma } from '../db/client.js';

interface ConversationConnection {
  ws: WebSocket;
  conversationId: string;
  uiAgentId: string;
}

const connections = new Map<WebSocket, ConversationConnection>();

export function setupWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    console.log('WebSocket client connected');

    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'subscribe' && message.conversation_id) {
          await subscribeToConversation(ws, message.conversation_id);
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    });

    ws.on('close', async () => {
      console.log('WebSocket client disconnected');
      await cleanupConnection(ws);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });

  console.log('WebSocket server initialized on /ws');
  return wss;
}

async function subscribeToConversation(ws: WebSocket, conversationId: string): Promise<void> {
  // Clean up any existing subscription
  await cleanupConnection(ws);

  // Look up conversation to verify it exists
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      agents: {
        include: { prototype: true },
      },
    },
  });

  if (!conversation) {
    ws.send(JSON.stringify({ type: 'error', message: 'Conversation not found' }));
    return;
  }

  try {
    // Attach WebSocket to the UI agent for this conversation
    const uiAgent = orchestrationFramework.attachWebSocketToConversation(conversationId, ws);

    if (!uiAgent) {
      ws.send(JSON.stringify({ type: 'error', message: 'UI agent not found for conversation' }));
      return;
    }

    // Store connection info
    connections.set(ws, {
      ws,
      conversationId,
      uiAgentId: uiAgent.getId(),
    });

    ws.send(JSON.stringify({
      type: 'subscribed',
      conversation_id: conversationId,
      ui_agent_id: uiAgent.getId(),
    }));

    console.log(`WebSocket attached to conversation ${conversationId} via UI agent ${uiAgent.getId()}`);
  } catch (error) {
    console.error('Failed to subscribe to conversation:', error);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to subscribe' }));
  }
}

async function cleanupConnection(ws: WebSocket): Promise<void> {
  const conn = connections.get(ws);
  if (conn) {
    // WebSocket detachment is handled by the UI agent
    connections.delete(ws);
  }
}

export async function closeAllConnections(): Promise<void> {
  for (const conn of connections.values()) {
    try {
      conn.ws.close();
    } catch (error) {
      console.error('Error closing connection:', error);
    }
  }
  connections.clear();
}
