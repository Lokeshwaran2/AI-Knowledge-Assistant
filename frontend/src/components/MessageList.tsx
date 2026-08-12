import { useRef, useEffect } from 'react';
import { useChat } from '../contexts/ChatContext';
import type { Message } from '../types/chat.types';
import MessageBubble from './MessageBubble';
import Loader from './Loader';

export default function MessageList() {
  const { messages } = useChat();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="message-list-empty">
        <div className="empty-icon">🧠</div>
        <h3>Ask anything about your documents</h3>
        <p>Upload a document first, then start asking questions.</p>
      </div>
    );
  }

  return (
    <div className="message-list">
      {messages.map((msg: Message) =>
        msg.isLoading ? (
          <Loader key={msg.id} />
        ) : (
          <MessageBubble key={msg.id} message={msg} />
        )
      )}
      <div ref={bottomRef} />
    </div>
  );
}
