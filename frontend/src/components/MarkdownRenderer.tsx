import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import { Copy, Check, ExternalLink } from 'lucide-react';

interface Props {
  content: string;
  isStreaming?: boolean;
}

export default function MarkdownRenderer({ content, isStreaming }: Props) {
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCodeId(id);
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  return (
    <div className="markdown-body-container">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeHighlight, rehypeKatex]}
        components={{
          // Code block and inline code overrides
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const codeString = String(children).replace(/\n$/, '');
            const isInline = !match && !String(children).includes('\n');

            if (isInline) {
              return (
                <code className="inline-code-pill" {...props}>
                  {children}
                </code>
              );
            }

            const lang = match ? match[1] : 'code';
            const blockId = `code-${Math.random().toString(36).substr(2, 9)}`;

            return (
              <div className="code-block-wrapper">
                <div className="code-header">
                  <div className="window-header-dots">
                    <span className="window-dot window-dot-red" />
                    <span className="window-dot window-dot-yellow" />
                    <span className="window-dot window-dot-green" />
                    <span className="code-lang-tag">{lang}</span>
                  </div>
                  <button
                    className="code-copy-btn"
                    onClick={() => handleCopy(codeString, blockId)}
                    title="Copy code to clipboard"
                    type="button"
                  >
                    {copiedCodeId === blockId ? (
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
                <pre className="code-block-pre">
                  <code className={className} {...props}>
                    {children}
                  </code>
                </pre>
              </div>
            );
          },

          // Table override for responsive overflow wrapper
          table({ children, ...props }) {
            return (
              <div className="markdown-table-wrapper">
                <table className="markdown-table" {...props}>
                  {children}
                </table>
              </div>
            );
          },

          // Link override for security & visual indicator
          a({ href, children, ...props }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="markdown-link"
                {...props}
              >
                {children}
                <ExternalLink size={12} className="link-icon" />
              </a>
            );
          },

          // Blockquote override
          blockquote({ children, ...props }) {
            return (
              <blockquote className="markdown-blockquote" {...props}>
                {children}
              </blockquote>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>

      {isStreaming && <span className="streaming-cursor">▌</span>}
    </div>
  );
}
