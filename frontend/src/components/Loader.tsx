import { Bot } from 'lucide-react';

export default function Loader() {
  return (
    <div className="message-bubble-wrapper assistant">
      <div className="avatar ai-avatar">
        <Bot size={18} />
      </div>
      <div className="bubble loader-bubble">
        <div className="typing-indicator" aria-label="Generating response">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    </div>
  );
}

