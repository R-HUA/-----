import { useMutation, useQuery } from "@tanstack/react-query";
import { Database, Trash2 } from "lucide-react";
import { FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";
import { cleanup, getSystem } from "../api/adminApi";
import { formatBytes } from "../utils/format";
import { AdminLayout, useAdminGuard } from "./AdminLayout";

export function AdminSystemPage() {
  const guard = useAdminGuard();
  const system = useQuery({ queryKey: ["system"], queryFn: getSystem, enabled: guard.isSuccess });
  const [days, setDays] = useState(14);
  const clean = useMutation({ mutationFn: () => cleanup(days) });
  if (guard.isError) return <Navigate to="/admin/login" replace />;
  function submit(event: FormEvent) {
    event.preventDefault();
    clean.mutate();
  }
  return (
    <AdminLayout>
      <h1 className="text-xl font-semibold text-slate-900">System</h1>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <section className="border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2 font-medium text-slate-900">
            <Database size={18} /> Runtime
          </div>
          <dl className="space-y-2 text-sm">
            <Row label="Version" value={system.data?.version || "-"} />
            <Row label="Public URL" value={system.data?.publicBaseUrl || "-"} />
            <Row label="Database" value={system.data?.database || "-"} />
            <Row label="Data dir" value={system.data?.dataDir || "-"} />
            <Row label="Storage" value={formatBytes(system.data?.storageBytes || 0)} />
          </dl>
        </section>
        <section className="border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2 font-medium text-slate-900">
            <Trash2 size={18} /> Cleanup
          </div>
          <form className="flex items-center gap-2" onSubmit={submit}>
            <input className="h-10 w-24 border border-slate-300 px-3" type="number" min={1} value={days} onChange={(event) => setDays(Number(event.target.value))} />
            <span className="text-sm text-slate-600">days</span>
            <button className="ml-auto h-10 bg-slate-900 px-4 text-sm text-white">Run cleanup</button>
          </form>
          {clean.data ? <div className="mt-3 text-sm text-slate-600">Deleted {clean.data.deletedArtifacts} artifacts.</div> : null}
        </section>
      </div>
    </AdminLayout>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="min-w-0 truncate font-mono text-xs text-slate-800">{value}</dd>
    </div>
  );
}
