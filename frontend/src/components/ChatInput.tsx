import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { useChat } from '../contexts/ChatContext';

export default function ChatInput() {
  const { sendMessage, stopGenerating, isSending } = useChat();
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea based on input content height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [value]);

  const handleSend = async () => {
    if (isSending) {
      stopGenerating();
      return;
    }
    if (!value.trim()) return;
    const msg = value.trim();
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
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
        rows={1}
        aria-label="Ask a question about your documents"
      />
      <button
        id="chat-send-button"
        className={`send-button ${isSending ? 'stop-generating' : ''}`}
        onClick={handleSend}
        disabled={!isSending && !value.trim()}
        title={isSending ? 'Stop generating' : 'Send message'}
        aria-label={isSending ? 'Stop generating' : 'Send message'}
        type="button"
      >
        {isSending ? (
          <Square size={16} fill="currentColor" />
        ) : (
          <ArrowUp size={18} />
        )}
      </button>
    </div>
  );
}

