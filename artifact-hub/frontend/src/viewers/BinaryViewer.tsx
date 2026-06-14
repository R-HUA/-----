import { Download } from "lucide-react";
import { formatBytes } from "../utils/format";

export function BinaryViewer({ filename, kind, sizeBytes, downloadUrl }: { filename: string; kind: string; sizeBytes: number; downloadUrl: string }) {
  return (
    <div className="flex h-full items-center justify-center bg-white p-8">
      <div className="w-full max-w-md border border-slate-200 p-6 text-center">
        <div className="text-lg font-semibold text-slate-800">{filename}</div>
        <div className="mt-2 text-sm text-slate-500">{kind} · {formatBytes(sizeBytes)}</div>
        <a className="mt-5 inline-flex items-center gap-2 rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700" href={downloadUrl}>
          <Download size={16} /> Download
        </a>
      </div>
    </div>
  );
}
