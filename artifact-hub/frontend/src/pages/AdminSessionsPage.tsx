import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { deleteSession, listSessions } from "../api/adminApi";
import { ConfirmButton } from "../components/ConfirmButton";
import { EmptyState } from "../components/EmptyState";
import { formatBytes, formatDate } from "../utils/format";
import { AdminLayout, useAdminGuard } from "./AdminLayout";

export function AdminSessionsPage() {
  const guard = useAdminGuard();
  const [q, setQ] = useState("");
  const queryClient = useQueryClient();
  const sessions = useQuery({
    queryKey: ["admin-sessions", q],
    queryFn: () => listSessions(q),
    enabled: guard.isSuccess
  });
  const remove = useMutation({
    mutationFn: deleteSession,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-sessions"] })
  });
  if (guard.isError) return <Navigate to="/admin/login" replace />;
  return (
    <AdminLayout>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Sessions</h1>
          <p className="text-sm text-slate-500">Browse and manage uploaded artifact sessions.</p>
        </div>
        <label className="flex h-10 items-center gap-2 border border-slate-300 bg-white px-3">
          <Search size={16} className="text-slate-400" />
          <input className="w-64 outline-none" value={q} placeholder="Search sessions" onChange={(event) => setQ(event.target.value)} />
        </label>
      </div>
      {sessions.isLoading ? <div className="text-sm text-slate-500">Loading sessions...</div> : null}
      {sessions.data?.sessions.length === 0 ? <EmptyState title="No sessions" detail="Uploaded artifacts will appear here." /> : null}
      {sessions.data?.sessions.length ? (
        <div className="overflow-hidden border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3">Session</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Artifacts</th>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {sessions.data.sessions.map((session) => (
                <tr key={session.sessionId} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <Link className="font-medium text-emerald-700 hover:underline" to={`/admin/sessions/${encodeURIComponent(session.sessionId)}`}>
                      {session.title || session.sessionId}
                    </Link>
                    <div className="text-xs text-slate-400">{session.sessionId}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{session.source || "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{session.artifactCount}</td>
                  <td className="px-4 py-3 text-slate-600">{formatBytes(session.totalSizeBytes)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(session.updatedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <ConfirmButton className="inline-flex items-center gap-2 rounded border border-red-200 px-3 py-1.5 text-red-700 hover:bg-red-50" onConfirm={() => remove.mutate(session.sessionId)}>
                      <Trash2 size={16} /> Delete
                    </ConfirmButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </AdminLayout>
  );
}
