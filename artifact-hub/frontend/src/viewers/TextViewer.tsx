import { WrapText } from "lucide-react";
import { useState } from "react";
import { useTextContent } from "./useTextContent";

export function TextViewer({ url, downloadUrl }: { url: string; downloadUrl: string }) {
  const [wrap, setWrap] = useState(true);
  const { data, isLoading, error } = useTextContent(url, 3 * 1024 * 1024);
  if (isLoading) return <div className="p-6 text-sm text-slate-500">Loading text...</div>;
  if (error || !data) return <div className="p-6 text-sm text-red-700">Unable to load text.</div>;
  const lines = data.text.split("\n");
  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex h-11 items-center justify-between border-b border-slate-200 px-3">
        <span className="text-sm text-slate-500">{lines.length} lines</span>
        <button className="inline-flex items-center gap-2 rounded border border-slate-300 px-3 py-1.5 text-sm" onClick={() => setWrap((value) => !value)}>
          <WrapText size={16} /> Wrap
        </button>
      </div>
      {data.truncated ? (
        <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Large file preview is truncated. <a className="underline" href={downloadUrl}>Download full file</a>.
        </div>
      ) : null}
      <div className="flex-1 overflow-auto font-mono text-sm leading-6">
        {lines.map((line, index) => (
          <div key={index} className="flex border-b border-slate-100">
            <span className="w-16 select-none bg-slate-50 pr-3 text-right text-slate-400">{index + 1}</span>
            <span className={`px-3 ${wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"}`}>{line || " "}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
