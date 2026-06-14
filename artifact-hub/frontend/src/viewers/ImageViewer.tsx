import { Minus, Plus } from "lucide-react";
import { useState } from "react";

export function ImageViewer({ url, title, svg }: { url: string; title: string; svg?: boolean }) {
  const [scale, setScale] = useState(1);
  if (svg) {
    return <iframe className="h-full w-full border-0 bg-white" title={title} src={url} sandbox="" />;
  }
  return (
    <div className="flex h-full flex-col bg-slate-100">
      <div className="flex h-11 items-center gap-2 border-b border-slate-200 bg-white px-3">
        <button className="rounded border border-slate-300 p-2" title="Zoom out" onClick={() => setScale((v) => Math.max(0.25, v - 0.25))}>
          <Minus size={16} />
        </button>
        <span className="w-16 text-center text-sm text-slate-600">{Math.round(scale * 100)}%</span>
        <button className="rounded border border-slate-300 p-2" title="Zoom in" onClick={() => setScale((v) => Math.min(4, v + 0.25))}>
          <Plus size={16} />
        </button>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-auto p-6">
        <img src={url} alt={title} style={{ transform: `scale(${scale})` }} className="max-h-full max-w-full object-contain" />
      </div>
    </div>
  );
}
