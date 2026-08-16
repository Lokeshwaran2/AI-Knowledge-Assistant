import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import api from '../services/api';
import { postSSE } from '../services/streamService';

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
  stopGenerating: () => void;
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

  const abortControllerRef = useRef<AbortController | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const stopGenerating = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsSending(false);
    }
  }, []);

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

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isSending) return;

      const userMessageId = `user-${Date.now()}`;
      const loadingMessageId = `assistant-loading-${Date.now()}`;

      // Immediately add user message and assistant placeholder
      setMessages((prev) => [
        ...prev,
        { id: userMessageId, role: 'user', content },
        { id: loadingMessageId, role: 'assistant', content: '', isLoading: true },
      ]);

      setIsSending(true);
      setError(null);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Progressive token buffer & animation frame loop for smooth 60fps UI rendering
      let pendingBuffer = '';
      let isStreamingDone = false;
      let frameId: number | null = null;

      const flushBufferLoop = () => {
        if (pendingBuffer.length > 0) {
          // Flush 1-4 characters per 16.6ms frame tick for smooth visual typing
          const chunkSize = Math.max(1, Math.min(4, Math.ceil(pendingBuffer.length / 3)));
          const chunk = pendingBuffer.slice(0, chunkSize);
          pendingBuffer = pendingBuffer.slice(chunkSize);

          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === loadingMessageId
                ? {
                    ...msg,
                    content: msg.content + chunk,
                    isLoading: false, // Hide spinner as soon as first token paints
                  }
                : msg
            )
          );
        }

        if (!isStreamingDone || pendingBuffer.length > 0) {
          frameId = requestAnimationFrame(flushBufferLoop);
        }
      };

      frameId = requestAnimationFrame(flushBufferLoop);

      try {
        await postSSE(
          '/chat/stream',
          {
            message: content,
            conversationId: activeConversationId,
          },
          (evt) => {
            if (evt.event === 'start') {
              if (evt.data.conversationId && !activeConversationId) {
                setActiveConversationId(evt.data.conversationId);
              }
            } else if (evt.event === 'token') {
              const delta = evt.data.delta || '';
              pendingBuffer += delta;
            } else if (evt.event === 'done') {
              isStreamingDone = true;
              // Flush any remaining text in buffer immediately
              if (pendingBuffer.length > 0) {
                const remaining = pendingBuffer;
                pendingBuffer = '';
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === loadingMessageId
                      ? { ...msg, content: msg.content + remaining, isLoading: false }
                      : msg
                  )
                );
              }
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === loadingMessageId
                    ? {
                        ...msg,
                        id: `assistant-${Date.now()}`,
                        isLoading: false,
                        tokensUsed: evt.data.tokensUsed,
                        latencyMs: evt.data.latencyMs,
                        chunksRetrieved: evt.data.chunksRetrieved,
                      }
                    : msg
                )
              );
              fetchConversations();
            } else if (evt.event === 'error') {
              isStreamingDone = true;
              const errMsg = evt.data.message || 'Stream error occurred.';
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === loadingMessageId
                    ? { ...m, content: errMsg, isLoading: false, isError: true }
                    : m
                )
              );
              setError(errMsg);
            }
          },
          controller.signal
        );
      } catch (err: unknown) {
        isStreamingDone = true;
        if (frameId) cancelAnimationFrame(frameId);
        if (err instanceof Error && err.name === 'AbortError') {
          console.log('[Chat] Generation stopped by user.');
          setMessages((prev) =>
            prev.map((m) => (m.id === loadingMessageId ? { ...m, isLoading: false } : m))
          );
          return;
        }

        const msg =
          (err as { message?: string })?.message ||
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
        abortControllerRef.current = null;
      }
    },
    [activeConversationId, isSending, fetchConversations]
  );

  return (
    <ChatContext.Provider
      value={{
        messages,
        conversations,
        activeConversationId,
        isSending,
        error,
        sendMessage,
        stopGenerating,
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
