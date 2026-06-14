import { FileCode, FileImage, FileJson, FileText, Package } from "lucide-react";
import type { ArtifactSummary } from "../types";
import { formatBytes, formatDate } from "../utils/format";

export function ArtifactSidebar({ artifacts, activeId }: { artifacts: ArtifactSummary[]; activeId?: string }) {
  return (
    <aside className="h-full w-full overflow-auto border-r border-slate-200 bg-white md:w-80">
      <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">Artifacts</div>
      <nav>
        {artifacts.map((artifact) => (
          <a
            key={artifact.artifactId}
            href={artifact.viewUrl}
            className={`flex gap-3 border-b border-slate-100 px-4 py-3 hover:bg-slate-50 ${activeId === artifact.artifactId ? "bg-emerald-50" : ""}`}
          >
            <KindIcon kind={artifact.kind} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-800">{artifact.title}</span>
              <span className="mt-1 block truncate text-xs text-slate-500">
                {artifact.kind} · {formatBytes(artifact.sizeBytes)} · {formatDate(artifact.createdAt)}
              </span>
            </span>
          </a>
        ))}
      </nav>
    </aside>
  );
}

function KindIcon({ kind }: { kind: string }) {
  const className = "mt-0.5 shrink-0 text-slate-500";
  if (kind === "image" || kind === "svg") return <FileImage className={className} size={18} />;
  if (kind === "json" || kind === "csv" || kind === "junit") return <FileJson className={className} size={18} />;
  if (kind === "html" || kind === "html-bundle") return <FileCode className={className} size={18} />;
  if (kind === "archive" || kind === "binary") return <Package className={className} size={18} />;
  return <FileText className={className} size={18} />;
}
