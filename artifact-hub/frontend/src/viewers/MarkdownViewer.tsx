import "highlight.js/styles/github.css";
import hljs from "highlight.js";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { useTextContent } from "./useTextContent";

export function MarkdownViewer({ url, downloadUrl }: { url: string; downloadUrl: string }) {
  const { data, isLoading, error } = useTextContent(url);
  if (isLoading) return <div className="p-6 text-sm text-slate-500">Loading Markdown...</div>;
  if (error || !data) return <div className="p-6 text-sm text-red-700">Unable to load Markdown.</div>;
  return (
    <div className="h-full overflow-auto bg-white p-6">
      {data.truncated ? (
        <div className="mb-4 border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Large file preview is truncated. <a className="underline" href={downloadUrl}>Download full file</a>.
        </div>
      ) : null}
      <article className="markdown-body max-w-5xl">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeSanitize]}
          components={{
            code({ className, children, ...props }) {
              const match = /language-(\w+)/.exec(className || "");
              const value = String(children).replace(/\n$/, "");
              if (match) {
                const html = hljs.highlight(value, { language: match[1], ignoreIllegals: true }).value;
                return <code className={className} dangerouslySetInnerHTML={{ __html: html }} />;
              }
              return <code className={className} {...props}>{children}</code>;
            }
          }}
        >
          {data.text}
        </ReactMarkdown>
      </article>
    </div>
  );
}
