import { Download, ExternalLink } from "lucide-react";
import { CopyButton } from "./CopyButton";
import { formatBytes, formatDate } from "../utils/format";
import type { ViewArtifact } from "../types";

export function TopBar({ artifact }: { artifact: ViewArtifact }) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-slate-900">{artifact.title}</div>
        <div className="truncate text-xs text-slate-500">
          {artifact.sessionId} · {artifact.kind} · {formatBytes(artifact.sizeBytes)} · {formatDate(artifact.createdAt)}
        </div>
      </div>
      <div className="ml-3 flex shrink-0 items-center gap-2">
        <CopyButton value={window.location.href} />
        <a className="inline-flex h-9 items-center gap-2 rounded border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-100" href={artifact.contentUrl} target="_blank" rel="noreferrer">
          <ExternalLink size={16} /> Raw
        </a>
        <a className="inline-flex h-9 items-center gap-2 rounded bg-slate-900 px-3 text-sm text-white hover:bg-slate-700" href={artifact.downloadUrl}>
          <Download size={16} /> Download
        </a>
      </div>
    </header>
  );
}
