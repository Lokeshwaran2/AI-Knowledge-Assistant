import React, { createContext, useContext, useState, useCallback } from 'react';
import api from '../services/api';

import type { Message, Conversation } from '../types/chat.types';

// Re-export for backwards compatibility
export type { Message, Conversation };


interface ChatContextType {
  messages: Message[];
  conversations: Conversation[];
  activeConversationId: string | null;
  isSending: boolean;
  error: string | null;
  sendMessage: (content: string) => Promise<void>;
  loadConversation: (id: string) => Promise<void>;
  startNewConversation: () => void;
  deleteConversation: (id: string) => Promise<void>;
  fetchConversations: () => Promise<void>;
  clearError: () => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ChatContext = createContext<ChatContextType | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const fetchConversations = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const { data } = await api.get('/chat/conversations');
      setConversations(data.conversations || []);
    } catch {
      // Non-critical — don't surface to user
    }
  }, []);

  React.useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      fetchConversations();
    }
  }, [fetchConversations]);

  const loadConversation = useCallback(async (id: string) => {
    try {
      const { data } = await api.get(`/chat/conversations/${id}/messages`);
      setActiveConversationId(id);
      setMessages(
        data.messages.map((m: Record<string, unknown>, i: number) => ({
          id: `${id}-${i}`,
          role: m.role,
          content: m.content,
          tokensUsed: m.tokens_used,
          latencyMs: m.latency_ms,
          chunksRetrieved: m.chunks_retrieved,
        }))
      );
    } catch {
      setError('Failed to load conversation.');
    }
  }, []);

  const startNewConversation = useCallback(() => {
    setActiveConversationId(null);
    setMessages([]);
    setError(null);
  }, []);

  const deleteConversation = useCallback(
    async (id: string) => {
      try {
        await api.delete(`/chat/conversations/${id}`);
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (activeConversationId === id) {
          setActiveConversationId(null);
          setMessages([]);
        }
      } catch {
        setError('Failed to delete conversation.');
      }
    },
    [activeConversationId]
  );

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isSending) return;

    const userMessageId = `user-${Date.now()}`;
    const loadingMessageId = `loading-${Date.now()}`;

    // Immediately add user message and loading indicator
    setMessages((prev) => [
      ...prev,
      { id: userMessageId, role: 'user', content },
      { id: loadingMessageId, role: 'assistant', content: '', isLoading: true },
    ]);

    setIsSending(true);
    setError(null);

    try {
      const { data } = await api.post('/chat', {
        message: content,
        conversationId: activeConversationId,
      });

      // Update active conversation
      if (data.conversationId && !activeConversationId) {
        setActiveConversationId(data.conversationId);
      }

      // Replace loading message with real response
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === loadingMessageId
            ? {
                id: `assistant-${Date.now()}`,
                role: 'assistant' as const,
                content: data.message,
                tokensUsed: data.tokensUsed,
                latencyMs: data.latencyMs,
                chunksRetrieved: data.chunksRetrieved,
                isLoading: false,
              }
            : msg
        )
      );

      // Refresh conversation list
      fetchConversations();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Unable to get a response. Please try again.';

      setMessages((prev) =>
        prev.map((m) =>
          m.id === loadingMessageId
            ? { ...m, content: msg, isLoading: false, isError: true }
            : m
        )
      );

      setError(msg);
    } finally {
      setIsSending(false);
    }
  }, [activeConversationId, isSending, fetchConversations]);

  return (
    <ChatContext.Provider
      value={{
        messages,
        conversations,
        activeConversationId,
        isSending,
        error,
        sendMessage,
        loadConversation,
        startNewConversation,
        deleteConversation,
        fetchConversations,
        clearError,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useChat(): ChatContextType {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used inside ChatProvider');
  return ctx;
}
