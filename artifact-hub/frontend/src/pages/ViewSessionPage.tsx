import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "react-router-dom";
import { getViewSession } from "../api/viewApi";
import { EmptyState } from "../components/EmptyState";
import { formatBytes, formatDate } from "../utils/format";

export function ViewSessionPage() {
  const { sessionId = "" } = useParams();
  const location = useLocation();
  const { data, isLoading, error } = useQuery({
    queryKey: ["view-session", sessionId, location.search],
    queryFn: () => getViewSession(sessionId, location.search)
  });
  if (isLoading) return <div className="p-6 text-sm text-slate-500">Loading session...</div>;
  if (error || !data) return <div className="p-6 text-sm text-red-700">Unable to load session.</div>;
  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white px-5 py-4">
        <h1 className="text-lg font-semibold text-slate-900">{data.title || data.sessionId}</h1>
        <div className="mt-1 text-sm text-slate-500">
          {data.artifacts.length} artifacts · updated {formatDate(data.updatedAt)}
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-5">
        {data.artifacts.length === 0 ? (
          <EmptyState title="No visible artifacts" detail="This session has no public artifacts for the current token." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {data.artifacts.map((artifact) => (
              <Link key={artifact.artifactId} className="border border-slate-200 bg-white p-4 hover:border-emerald-600" to={artifact.viewUrl}>
                <div className="truncate font-medium text-slate-900">{artifact.title}</div>
                <div className="mt-2 text-sm text-slate-500">{artifact.kind} · {formatBytes(artifact.sizeBytes)}</div>
                <div className="mt-1 text-xs text-slate-400">{formatDate(artifact.createdAt)}</div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
