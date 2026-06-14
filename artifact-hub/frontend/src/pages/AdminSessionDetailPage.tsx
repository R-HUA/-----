import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, RefreshCcw, Save, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { deleteArtifact, getSession, rotateSessionToken, updateSession } from "../api/adminApi";
import { ConfirmButton } from "../components/ConfirmButton";
import { CopyButton } from "../components/CopyButton";
import { formatBytes, formatDate } from "../utils/format";
import { AdminLayout, useAdminGuard } from "./AdminLayout";

export function AdminSessionDetailPage() {
  const { sessionId = "" } = useParams();
  const guard = useAdminGuard();
  const queryClient = useQueryClient();
  const session = useQuery({
    queryKey: ["admin-session", sessionId],
    queryFn: () => getSession(sessionId),
    enabled: guard.isSuccess
  });
  const [title, setTitle] = useState("");
  const [source, setSource] = useState("");
  useEffect(() => {
    if (session.data) {
      setTitle(session.data.title || "");
      setSource(session.data.source || "");
    }
  }, [session.data]);
  const update = useMutation({
    mutationFn: () => updateSession(sessionId, { title, source }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-session", sessionId] })
  });
  const rotate = useMutation({
    mutationFn: () => rotateSessionToken(sessionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-session", sessionId] })
  });
  const removeArtifact = useMutation({
    mutationFn: deleteArtifact,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-session", sessionId] })
  });
  if (guard.isError) return <Navigate to="/admin/login" replace />;
  if (session.isLoading || !session.data) return <AdminLayout><div className="text-sm text-slate-500">Loading session...</div></AdminLayout>;
  function submit(event: FormEvent) {
    event.preventDefault();
    update.mutate();
  }
  return (
    <AdminLayout>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold text-slate-900">{session.data.title || session.data.sessionId}</h1>
          <p className="mt-1 truncate text-sm text-slate-500">{session.data.sessionId}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <CopyButton value={session.data.sessionUrl} label="Copy session" />
          <button className="inline-flex h-9 items-center gap-2 rounded border border-slate-300 px-3 text-sm" onClick={() => rotate.mutate()}>
            <RefreshCcw size={16} /> Rotate token
          </button>
        </div>
      </div>
      <form className="mb-5 grid gap-3 border border-slate-200 bg-white p-4 md:grid-cols-[1fr_1fr_auto]" onSubmit={submit}>
        <input className="h-10 border border-slate-300 px-3" value={title} placeholder="Title" onChange={(event) => setTitle(event.target.value)} />
        <input className="h-10 border border-slate-300 px-3" value={source} placeholder="Source" onChange={(event) => setSource(event.target.value)} />
        <button className="inline-flex h-10 items-center justify-center gap-2 bg-slate-900 px-4 text-sm text-white">
          <Save size={16} /> Save
        </button>
      </form>
      <div className="overflow-hidden border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Artifact</th>
              <th className="px-4 py-3">Kind</th>
              <th className="px-4 py-3">Visibility</th>
              <th className="px-4 py-3">Size</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {session.data.artifacts.map((artifact) => (
              <tr key={artifact.artifactId} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <Link className="font-medium text-emerald-700 hover:underline" to={`/admin/artifacts/${artifact.artifactId}`}>{artifact.title}</Link>
                  <div className="text-xs text-slate-400">{artifact.filename}</div>
                </td>
                <td className="px-4 py-3">{artifact.kind}</td>
                <td className="px-4 py-3">{artifact.visibility}</td>
                <td className="px-4 py-3">{formatBytes(artifact.sizeBytes)}</td>
                <td className="px-4 py-3">{formatDate(artifact.createdAt)}</td>
                <td className="px-4 py-3 text-right">
                  <a className="mr-2 inline-flex items-center gap-2 rounded border border-slate-300 px-3 py-1.5 text-slate-700" href={artifact.viewUrl} target="_blank" rel="noreferrer">
                    <Copy size={16} /> Open
                  </a>
                  <ConfirmButton className="inline-flex items-center gap-2 rounded border border-red-200 px-3 py-1.5 text-red-700 hover:bg-red-50" onConfirm={() => removeArtifact.mutate(artifact.artifactId)}>
                    <Trash2 size={16} /> Delete
                  </ConfirmButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
