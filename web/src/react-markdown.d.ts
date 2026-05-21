declare module 'react-markdown' {
  import { type ReactNode, type ComponentType } from 'react';

  interface ReactMarkdownProps {
    children: string;
    remarkPlugins?: unknown[];
    components?: Record<string, ComponentType<Record<string, unknown>>>;
  }

  const ReactMarkdown: ComponentType<ReactMarkdownProps>;
  export default ReactMarkdown;
}

declare module 'remark-gfm' {
  const remarkGfm: unknown;
  export default remarkGfm;
}
