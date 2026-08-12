import type { Message } from '../types/chat.types';

interface Props {
  message: Message;
}

export default function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user';

  return (
    <div className={`message-bubble-wrapper ${isUser ? 'user' : 'assistant'}`}>
      <div className="avatar">{isUser ? '👤' : '🤖'}</div>
      <div className={`bubble ${message.isError ? 'error' : ''}`}>
        <p className="bubble-content">{message.content}</p>

        {/* Metadata footer — observability signal */}
        {!isUser && message.tokensUsed !== undefined && message.tokensUsed > 0 && (
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
