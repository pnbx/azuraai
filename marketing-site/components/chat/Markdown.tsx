"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import SyntaxHighlighter from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import Icon from "@/components/Icon";

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function download() {
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `azura-snippet.${lang || "txt"}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="my-4 overflow-hidden rounded-2xl border border-white/10 bg-[#0d1117]" dir="ltr">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-mist-400">{lang || "code"}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={download}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] text-mist-400 transition hover:bg-white/10 hover:text-white"
          >
            <Icon name="copy" size={12} />
            دانلود
          </button>
          <button
            onClick={copy}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] text-mist-400 transition hover:bg-white/10 hover:text-white"
          >
            <Icon name={copied ? "check" : "copy"} size={12} />
            {copied ? "کپی شد" : "کپی"}
          </button>
        </div>
      </div>
      <SyntaxHighlighter
        language={lang || "text"}
        style={oneDark}
        customStyle={{ margin: 0, background: "transparent", padding: "1rem", fontSize: "0.8rem", lineHeight: 1.7 }}
        wrapLongLines
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

export default function Markdown({ content }: { content: string }) {
  return (
    <div className="text-sm leading-8 text-mist-100">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <h1 className="mb-3 mt-5 text-xl font-black text-white" {...p} />,
          h2: (p) => <h2 className="mb-2.5 mt-5 text-lg font-black text-white" {...p} />,
          h3: (p) => <h3 className="mb-2 mt-4 text-base font-bold text-white" {...p} />,
          p: (p) => <p className="mb-3 last:mb-0" {...p} />,
          ul: (p) => <ul className="mb-3 list-disc space-y-1.5 ps-6" {...p} />,
          ol: (p) => <ol className="mb-3 list-decimal space-y-1.5 ps-6" {...p} />,
          li: (p) => <li className="ps-1" {...p} />,
          a: (p) => (
            <a
              {...p}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white underline decoration-white/40 underline-offset-4 hover:decoration-white"
            />
          ),
          blockquote: (p) => (
            <blockquote className="mb-3 border-e-2 border-white/25 bg-white/[0.04] py-1 pe-4 ps-3 text-mist-300" {...p} />
          ),
          table: (p) => (
            <div className="mb-3 overflow-x-auto rounded-2xl border border-white/10">
              <table className="w-full text-xs" {...p} />
            </div>
          ),
          th: (p) => <th className="border-b border-white/10 bg-white/[0.04] px-3 py-2 text-start font-bold text-white" {...p} />,
          td: (p) => <td className="border-b border-white/5 px-3 py-2" {...p} />,
          hr: () => <hr className="my-4 border-white/10" />,
          code: (props) => {
            const { inline, className, children } = props as { inline?: boolean; className?: string; children?: React.ReactNode };
            const text = String(children ?? "").replace(/\n$/, "");
            if (inline) {
              return (
                <code className="rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[0.8em] text-white" dir="ltr">
                  {text}
                </code>
              );
            }
            const lang = /language-(\w+)/.exec(className ?? "")?.[1] ?? "";
            return <CodeBlock code={text} lang={lang} />;
          },
          pre: ({ children }) => <>{children}</>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
