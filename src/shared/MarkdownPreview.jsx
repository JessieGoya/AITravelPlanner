import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import './MarkdownPreview.css';

/**
 * Markdown 预览组件
 * 用于美化显示 AI 生成的 Markdown 内容
 */
export default function MarkdownPreview({ content, className = '' }) {
  if (!content || !content.trim()) {
    return <div className={`markdown-empty ${className}`}>生成结果将显示在此</div>;
  }

  return (
    <div className={`markdown-preview ${className}`}>
      <ReactMarkdown 
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

