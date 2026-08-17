import { User, Bot, Zap, Clock, FileText } from 'lucide-react';
import type { Message } from '../types/chat.types';
import MarkdownRenderer from './MarkdownRenderer';

interface Props {
  message: Message;
}

export default function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user';
  const isThinking = !isUser && message.isLoading && !message.content;
  const isStreaming = !isUser && (message.isStreaming || message.isLoading) && message.content.length > 0;

  return (
    <div className={`message-bubble-wrapper ${isUser ? 'user' : 'assistant'}`}>
      <div className={`avatar ${isUser ? 'user-avatar' : 'ai-avatar'}`}>
        {isUser ? <User size={18} /> : <Bot size={18} />}
      </div>

      <div className={`bubble ${message.isError ? 'error' : ''}`}>
        {isThinking ? (
          <div className="typing-indicator" title="Searching knowledge base & generating response…">
            <span></span>
            <span></span>
            <span></span>
          </div>
        ) : isUser ? (
          <p className="bubble-content">{message.content}</p>
        ) : (
          <MarkdownRenderer content={message.content} isStreaming={isStreaming} />
        )}

        {/* Metadata footer */}
        {!isUser && !isStreaming && !isThinking && message.tokensUsed !== undefined && message.tokensUsed > 0 && (
          <div className="bubble-meta">
            <span title="Tokens used">
              <Zap size={13} /> {message.tokensUsed} tokens
            </span>
            {message.latencyMs !== undefined && (
              <span title="Response latency">
                <Clock size={13} /> {(message.latencyMs / 1000).toFixed(1)}s
              </span>
            )}
            {message.chunksRetrieved !== undefined && (
              <span title="Context chunks used">
                <FileText size={13} /> {message.chunksRetrieved} chunks
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

