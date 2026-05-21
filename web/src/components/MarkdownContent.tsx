import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useState, type ReactNode } from 'react';

interface Props {
  content: string;
}

export function MarkdownContent({ content }: Props) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }: { className?: string; children?: ReactNode; [key: string]: unknown }) {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !match && !String(children).includes('\n');
            if (isInline) {
              return <code className="md-inline-code" {...props}>{children}</code>;
            }
            return (
              <div className="md-code-block">
                {match && <div className="md-code-lang">{match[1]}</div>}
                <pre><code className={className} {...props}>{children}</code></pre>
              </div>
            );
          },
          table({ children }: { children?: ReactNode }) {
            return <div className="md-table-wrap"><table>{children}</table></div>;
          },
          a({ href, children }: { href?: string; children?: ReactNode }) {
            return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      className="copy-btn"
      onClick={handleCopy}
      title={copied ? 'Copied!' : 'Copy to clipboard'}
      style={copied ? { color: 'var(--success)', opacity: 1 } : undefined}
    >
      {copied ? '✓' : '⧉'}
    </button>
  );
}
