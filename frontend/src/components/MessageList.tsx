import { useRef, useEffect } from 'react';
import { Brain, Sparkles } from 'lucide-react';
import { useChat } from '../contexts/ChatContext';
import type { Message } from '../types/chat.types';
import MessageBubble from './MessageBubble';

export default function MessageList() {
  const { messages, sendMessage, isSending } = useChat();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll smoothly to bottom on message content updates
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSuggestedPrompt = (text: string) => {
    if (!isSending) {
      sendMessage(text);
    }
  };

  if (messages.length === 0) {
    return (
      <div className="message-list-empty">
        <div className="empty-icon-badge">
          <Brain size={32} />
        </div>
        <h3>Ask anything about your documents</h3>
        <p>Upload a document in the Knowledge Base, then start asking questions.</p>

        <div className="suggested-prompts">
          <button
            className="prompt-chip"
            onClick={() =>
              handleSuggestedPrompt('Summarize the key points of the uploaded documents.')
            }
          >
            <Sparkles size={14} style={{ color: 'var(--accent-light)', flexShrink: 0 }} />
            <span>"Summarize the key points of the uploaded documents."</span>
          </button>
          <button
            className="prompt-chip"
            onClick={() =>
              handleSuggestedPrompt('What are the main takeaways and conclusions?')
            }
          >
            <Sparkles size={14} style={{ color: 'var(--accent-light)', flexShrink: 0 }} />
            <span>"What are the main takeaways and conclusions?"</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="message-list" role="log" aria-live="polite">
      {messages.map((msg: Message) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

