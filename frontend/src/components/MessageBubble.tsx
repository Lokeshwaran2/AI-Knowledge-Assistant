import { useState } from 'react';
import { User, Bot, Zap, Clock, FileText, Check, Copy } from 'lucide-react';
import type { Message } from '../types/chat.types';

interface Props {
  message: Message;
}

export default function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user';
  const isThinking = !isUser && message.isLoading && !message.content;
  const isStreaming = !isUser && (message.isStreaming || message.isLoading) && message.content.length > 0;
  const [copiedCodeIndex, setCopiedCodeIndex] = useState<number | null>(null);

  const handleCopyCode = (codeText: string, index: number) => {
    navigator.clipboard.writeText(codeText);
    setCopiedCodeIndex(index);
    setTimeout(() => setCopiedCodeIndex(null), 2000);
  };

  // Helper to parse code blocks in text (```code```)
  const renderFormattedContent = (content: string) => {
    if (isUser) {
      return <p className="bubble-content">{content}</p>;
    }

    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const parts = [];
    let lastIndex = 0;
    let match;
    let codeBlockCount = 0;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push(
          <span key={`text-${lastIndex}`}>
            {content.substring(lastIndex, match.index)}
          </span>
        );
      }

      const lang = match[1] || 'code';
      const codeText = match[2].trim();
      const currentIndex = codeBlockCount++;

      parts.push(
        <div key={`code-block-${currentIndex}`} className="code-block-wrapper">
          <div className="code-header">
            <div className="window-header-dots">
              <span className="window-dot window-dot-red" />
              <span className="window-dot window-dot-yellow" />
              <span className="window-dot window-dot-green" />
              <span className="code-lang-tag">{lang}</span>
            </div>
            <button
              className="code-copy-btn"
              onClick={() => handleCopyCode(codeText, currentIndex)}
              title="Copy Code"
              type="button"
            >
              {copiedCodeIndex === currentIndex ? (
                <>
                  <Check size={13} style={{ color: 'var(--success)' }} />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy size={13} />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
          <pre>
            <code>{codeText}</code>
          </pre>
        </div>
      );

      lastIndex = codeBlockRegex.lastIndex;
    }

    if (lastIndex < content.length) {
      parts.push(
        <span key={`text-${lastIndex}`}>
          {content.substring(lastIndex)}
        </span>
      );
    }

    return (
      <div className="bubble-content">
        {parts.length > 0 ? parts : content}
        {isStreaming && <span className="streaming-cursor">▌</span>}
      </div>
    );
  };

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
        ) : (
          renderFormattedContent(message.content)
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

