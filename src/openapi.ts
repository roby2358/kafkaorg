import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// Extend Zod with OpenAPI capabilities
extendZodWithOpenApi(z);

// Create the registry
export const registry = new OpenAPIRegistry();

// Register schemas
export const SignInRequestSchema = registry.register(
  'SignInRequest',
  z.object({
    user_id: z.string().min(1).max(32).openapi({ example: 'roby' }),
  })
);

export const SignUpRequestSchema = registry.register(
  'SignUpRequest',
  z.object({
    user_id: z.string().min(1).max(32).openapi({ example: 'roby' }),
    name: z.string().min(1).openapi({ example: 'Roby' }),
  })
);

export const UserSchema = registry.register(
  'User',
  z.object({
    id: z.string().openapi({ example: 'roby' }),
    name: z.string().openapi({ example: 'Roby' }),
    created: z.string().openapi({ example: '2024-01-01T00:00:00.000Z' }),
    updated: z.string().openapi({ example: '2024-01-01T00:00:00.000Z' }),
  })
);

export const SignInResponseSchema = registry.register(
  'SignInResponse',
  z.object({
    found: z.boolean(),
    user: UserSchema.optional(),
  })
);

export const SignUpResponseSchema = registry.register(
  'SignUpResponse',
  z.object({
    user: UserSchema,
  })
);

export const UserMessageRequestSchema = registry.register(
  'UserMessageRequest',
  z.object({
    conversation_id: z.number().int().openapi({ example: 1 }),
    user_id: z.string().openapi({ example: 'roby' }),
    message: z.string().min(1).openapi({ example: 'Hello!' }),
  })
);

export const UserMessageResponseSchema = registry.register(
  'UserMessageResponse',
  z.object({
    sent: z.boolean().openapi({ example: true }),
  })
);

export const CreateConversationRequestSchema = registry.register(
  'CreateConversationRequest',
  z.object({
    user_id: z.string().openapi({ example: 'roby' }),
  })
);

export const ConversationSchema = registry.register(
  'Conversation',
  z.object({
    id: z.number().int().openapi({ example: 1 }),
    description: z.string().openapi({ example: 'Conversation started 2024-01-01T00:00:00.000Z' }),
    topic: z.string().openapi({ example: 'conv-1' }),
    user_id: z.string().openapi({ example: 'roby' }),
    agent_id: z.number().int().openapi({ example: 1 }),
    created: z.string().openapi({ example: '2024-01-01T00:00:00.000Z' }),
  })
);

export const CreateConversationResponseSchema = registry.register(
  'CreateConversationResponse',
  z.object({
    conversation: ConversationSchema,
  })
);

// Register API paths
registry.registerPath({
  method: 'post',
  path: '/api/signin',
  summary: 'Sign in with user ID',
  request: {
    body: {
      content: {
        'application/json': {
          schema: SignInRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Sign in result',
      content: {
        'application/json': {
          schema: SignInResponseSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/signup',
  summary: 'Create a new user',
  request: {
    body: {
      content: {
        'application/json': {
          schema: SignUpRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'User created successfully',
      content: {
        'application/json': {
          schema: SignUpResponseSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/user-message',
  summary: 'Send a message to the conversation (via Kafka)',
  request: {
    body: {
      content: {
        'application/json': {
          schema: UserMessageRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Message sent to Kafka topic',
      content: {
        'application/json': {
          schema: UserMessageResponseSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/conversation',
  summary: 'Create a new conversation with Kafka topic and agent',
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateConversationRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Conversation created',
      content: {
        'application/json': {
          schema: CreateConversationResponseSchema,
        },
      },
    },
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/conversation/{id}',
  summary: 'Get conversation by ID',
  request: {
    params: z.object({
      id: z.string().openapi({ example: '1' }),
    }),
  },
  responses: {
    200: {
      description: 'Conversation details',
      content: {
        'application/json': {
          schema: CreateConversationResponseSchema,
        },
      },
    },
  },
});

// Generate the OpenAPI document
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function generateOpenApiDocument(): any {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: '3.0.0',
    info: {
      title: 'Kafkaorg API',
      version: '1.0.0',
      description: 'API for Kafkaorg - AI agent orchestration platform',
    },
    servers: [
      { url: 'http://localhost:8821', description: 'Local Development' },
      { url: 'http://localhost:8822', description: 'Container' },
    ],
  });
}
