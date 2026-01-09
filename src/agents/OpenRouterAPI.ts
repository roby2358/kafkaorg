/**
 * OpenRouterAPI - Client for calling OpenRouter API with OpenAI protocol
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatCompletionResponse {
  model: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export class OpenRouterAPI {
  private apiKey: string;
  private baseURL: string;
  private model: string | undefined;

  constructor(apiKey: string, model?: string) {
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('OpenRouterAPI: API key is required');
    }
    this.apiKey = apiKey.trim();
    this.baseURL = 'https://openrouter.ai/api/v1';
    this.model = model;
  }

  /**
   * Call the chat completion API
   */
  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
    if (!this.apiKey || this.apiKey.trim() === '') {
      throw new Error('API key is missing or empty');
    }

    const apiKey = this.apiKey.trim();

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    const requestBody = {
      model: options.model || this.model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2000,
    };

    if (!requestBody.model) {
      throw new Error('Model is required - provide it in constructor or options');
    }

    console.log('Request URL:', `${this.baseURL}/chat/completions`);
    console.log('Request headers:', { ...headers, 'Authorization': 'Bearer ***' });
    console.log('Request body:', { ...requestBody, messages: `[${messages.length} messages]` });
    
    // Log full prompt/messages being sent
    console.log('=== PROMPT TO LLM ===');
    console.log('Model:', requestBody.model);
    console.log('Temperature:', requestBody.temperature);
    console.log('Max Tokens:', requestBody.max_tokens);
    console.log('Messages:', JSON.stringify(messages, null, 2));
    console.log('====================');

    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      let errorData: unknown = null;
      try {
        errorData = await response.json();
        if (errorData && typeof errorData === 'object') {
          const errorObj = errorData as { error?: { message?: string }; message?: string };
          errorMessage = errorObj.error?.message || errorObj.message || errorMessage;
        }
        console.error('=== API ERROR RESPONSE ===');
        console.error('Status:', response.status);
        console.error('Error Data:', JSON.stringify(errorData, null, 2));
        console.error('========================');
      } catch (e) {
        // If response isn't JSON, use status text
        console.error('=== API ERROR (Non-JSON) ===');
        console.error('Status:', response.status);
        console.error('Status Text:', response.statusText);
        console.error('===========================');
      }
      throw new Error(`API Error: ${errorMessage}`);
    }

    const data = await response.json() as ChatCompletionResponse;
    
    // Log raw response JSON
    console.log('=== RAW LLM RESPONSE ===');
    console.log(JSON.stringify(data, null, 2));
    console.log('========================');
    
    // Validate response structure
    if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
      throw new Error('API Error: Invalid response structure - no choices array');
    }
    
    if (!data.choices[0].message || !data.choices[0].message.content) {
      throw new Error('API Error: Invalid response structure - missing message content');
    }
    
    const responseContent = data.choices[0].message.content;
    
    // Log full response received
    console.log('=== RESPONSE FROM LLM ===');
    console.log('Model Used:', data.model || 'unknown');
    console.log('Usage:', JSON.stringify(data.usage || {}, null, 2));
    console.log('Response Content:', responseContent);
    console.log('==========================');
    
    return responseContent;
  }
}
