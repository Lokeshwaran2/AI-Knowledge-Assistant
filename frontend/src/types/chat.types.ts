// Shared types for the chat system
// Uses 'type' aliases (not interface) for rolldown/Vite 8 compatibility

export type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  tokensUsed?: number;
  latencyMs?: number;
  chunksRetrieved?: number;
  isLoading?: boolean;
  isError?: boolean;
};

export type Conversation = {
  id: string;
  title: string;
  message_count: number;
  total_tokens: number;
  created_at: string;
};
