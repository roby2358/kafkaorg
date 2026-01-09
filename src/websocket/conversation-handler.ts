// WebSocket handler for conversation messages

import { WebSocket, WebSocketServer } from 'ws';
import { Server } from 'http';
import { createConsumer } from '../kafka/client.js';
import { ConversationMessage } from '../kafka/types.js';
import { Consumer } from 'kafkajs';

interface ConversationConnection {
  ws: WebSocket;
  conversationId: number;
  topic: string;
  consumer: Consumer;
}

const connections = new Map<WebSocket, ConversationConnection>();

export function setupWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    console.log('WebSocket client connected');

    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'subscribe' && message.conversation_id && message.topic) {
          await subscribeToConversation(ws, message.conversation_id, message.topic);
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

async function subscribeToConversation(ws: WebSocket, conversationId: number, topic: string): Promise<void> {
  // Clean up any existing subscription
  await cleanupConnection(ws);

  const groupId = `ws-${conversationId}-${Date.now()}`;
  const consumer = createConsumer(groupId);

  try {
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: false });

    connections.set(ws, { ws, conversationId, topic, consumer });

    await consumer.run({
      eachMessage: async ({ message: kafkaMessage }) => {
        const rawMessage = kafkaMessage.value?.toString();
        if (!rawMessage) return;

        try {
          const parsed: ConversationMessage = JSON.parse(rawMessage);
          
          // Only forward agent messages to the client
          if (parsed.agent_id && !parsed.user_id) {
            ws.send(JSON.stringify({
              type: 'message',
              data: parsed,
            }));
          }
        } catch {
          console.error('Failed to parse Kafka message');
        }
      },
    });

    ws.send(JSON.stringify({ 
      type: 'subscribed', 
      conversation_id: conversationId,
      topic,
    }));

    console.log(`WebSocket subscribed to conversation ${conversationId} (topic: ${topic})`);
  } catch (error) {
    console.error('Failed to subscribe to conversation:', error);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to subscribe' }));
  }
}

async function cleanupConnection(ws: WebSocket): Promise<void> {
  const conn = connections.get(ws);
  if (conn) {
    try {
      await conn.consumer.disconnect();
    } catch (error) {
      console.error('Error disconnecting consumer:', error);
    }
    connections.delete(ws);
  }
}

export async function closeAllConnections(): Promise<void> {
  for (const conn of connections.values()) {
    try {
      await conn.consumer.disconnect();
      conn.ws.close();
    } catch (error) {
      console.error('Error closing connection:', error);
    }
  }
  connections.clear();
}
