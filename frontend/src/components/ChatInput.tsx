import { useState, useRef, type KeyboardEvent } from 'react';
import { useChat } from '../contexts/ChatContext';

export default function ChatInput() {
  const { sendMessage, isSending } = useChat();
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = async () => {
    if (!value.trim() || isSending) return;
    const msg = value.trim();
    setValue('');
    await sendMessage(msg);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-input-wrapper">
      <textarea
        ref={textareaRef}
        id="chat-message-input"
        className="chat-textarea"
        placeholder="Ask a question about your documents… (Enter to send)"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isSending}
        rows={1}
      />
      <button
        id="chat-send-button"
        className={`send-button ${isSending ? 'sending' : ''}`}
        onClick={handleSend}
        disabled={isSending || !value.trim()}
        title="Send message"
      >
        {isSending ? (
          <span className="send-spinner" />
        ) : (
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        )}
      </button>
    </div>
  );
}
