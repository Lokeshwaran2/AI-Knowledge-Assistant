import type { Message } from '../types/chat.types';

interface Props {
  message: Message;
}

export default function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user';
  const isThinking = !isUser && message.isLoading && !message.content;
  const isStreaming = !isUser && (message.isStreaming || message.isLoading) && message.content.length > 0;

  return (
    <div className={`message-bubble-wrapper ${isUser ? 'user' : 'assistant'}`}>
      <div className="avatar">{isUser ? '👤' : '🤖'}</div>
      <div className={`bubble ${message.isError ? 'error' : ''}`}>
        {isThinking ? (
          <div className="typing-indicator" title="Searching knowledge base & generating stream...">
            <span></span>
            <span></span>
            <span></span>
          </div>
        ) : (
          <p className="bubble-content">
            {message.content}
            {isStreaming && <span className="streaming-cursor">▌</span>}
          </p>
        )}

        {/* Metadata footer — observability signal */}
        {!isUser && !isStreaming && !isThinking && message.tokensUsed !== undefined && message.tokensUsed > 0 && (
          <div className="bubble-meta">
            <span title="Tokens used">⚡ {message.tokensUsed} tokens</span>
            {message.latencyMs !== undefined && (
              <span title="Response latency">⏱ {(message.latencyMs / 1000).toFixed(1)}s</span>
            )}
            {message.chunksRetrieved !== undefined && (
              <span title="Context chunks used">📄 {message.chunksRetrieved} chunks</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
