import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Trash2 } from "lucide-react";
import { FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";
import { createApiKey, listApiKeys, revokeApiKey } from "../api/adminApi";
import { ConfirmButton } from "../components/ConfirmButton";
import { CopyButton } from "../components/CopyButton";
import { formatDate } from "../utils/format";
import { AdminLayout, useAdminGuard } from "./AdminLayout";

export function AdminApiKeysPage() {
  const guard = useAdminGuard();
  const queryClient = useQueryClient();
  const [name, setName] = useState("codex-local");
  const [scopes, setScopes] = useState("write:artifact,read:artifact");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const keys = useQuery({ queryKey: ["api-keys"], queryFn: listApiKeys, enabled: guard.isSuccess });
  const create = useMutation({
    mutationFn: () => createApiKey(name, scopes.split(",").map((scope) => scope.trim()).filter(Boolean)),
    onSuccess: (data) => {
      setCreatedKey(data.key);
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    }
  });
  const revoke = useMutation({
    mutationFn: revokeApiKey,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-keys"] })
  });
  if (guard.isError) return <Navigate to="/admin/login" replace />;
  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate();
  }
  return (
    <AdminLayout>
      <h1 className="text-xl font-semibold text-slate-900">API Keys</h1>
      <form className="mt-4 grid gap-3 border border-slate-200 bg-white p-4 md:grid-cols-[1fr_2fr_auto]" onSubmit={submit}>
        <input className="h-10 border border-slate-300 px-3" value={name} onChange={(event) => setName(event.target.value)} />
        <input className="h-10 border border-slate-300 px-3" value={scopes} onChange={(event) => setScopes(event.target.value)} />
        <button className="inline-flex h-10 items-center justify-center gap-2 bg-slate-900 px-4 text-sm text-white">
          <KeyRound size={16} /> Create
        </button>
      </form>
      {createdKey ? (
        <div className="mt-4 border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
          <div className="font-medium">New key, shown once</div>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 overflow-auto bg-white px-2 py-1">{createdKey}</code>
            <CopyButton value={createdKey} label="Copy key" />
          </div>
        </div>
      ) : null}
      <div className="mt-5 overflow-hidden border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Prefix</th>
              <th className="px-4 py-3">Scopes</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Last used</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {keys.data?.apiKeys.map((key) => (
              <tr key={key.id} className="border-t border-slate-100">
                <td className="px-4 py-3">{key.name}</td>
                <td className="px-4 py-3 font-mono text-xs">{key.keyPrefix}</td>
                <td className="px-4 py-3">{key.scopes.join(", ")}</td>
                <td className="px-4 py-3">{formatDate(key.createdAt)}</td>
                <td className="px-4 py-3">{key.lastUsedAt ? formatDate(key.lastUsedAt) : "-"}</td>
                <td className="px-4 py-3 text-right">
                  {key.revokedAt ? (
                    <span className="text-xs text-slate-400">Revoked</span>
                  ) : (
                    <ConfirmButton className="inline-flex items-center gap-2 rounded border border-red-200 px-3 py-1.5 text-red-700 hover:bg-red-50" onConfirm={() => revoke.mutate(key.id)}>
                      <Trash2 size={16} /> Revoke
                    </ConfirmButton>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
