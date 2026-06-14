import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { getArtifact, updateArtifact } from "../api/adminApi";
import { CopyButton } from "../components/CopyButton";
import { formatBytes, formatDate } from "../utils/format";
import { ArtifactViewer } from "../viewers/ArtifactViewer";
import { AdminLayout, useAdminGuard } from "./AdminLayout";

export function AdminArtifactPage() {
  const { artifactId = "" } = useParams();
  const guard = useAdminGuard();
  const queryClient = useQueryClient();
  const artifact = useQuery({
    queryKey: ["admin-artifact", artifactId],
    queryFn: () => getArtifact(artifactId),
    enabled: guard.isSuccess
  });
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState("token");
  const [trustedHtml, setTrustedHtml] = useState(false);
  useEffect(() => {
    if (artifact.data) {
      setTitle(artifact.data.title);
      setDescription(artifact.data.description || "");
      setVisibility(artifact.data.visibility);
      setTrustedHtml(artifact.data.trustedHtml);
    }
  }, [artifact.data]);
  const update = useMutation({
    mutationFn: () => updateArtifact(artifactId, { title, description, visibility, trustedHtml }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-artifact", artifactId] })
  });
  if (guard.isError) return <Navigate to="/admin/login" replace />;
  if (artifact.isLoading || !artifact.data) return <AdminLayout><div className="text-sm text-slate-500">Loading artifact...</div></AdminLayout>;
  function submit(event: FormEvent) {
    event.preventDefault();
    update.mutate();
  }
  return (
    <AdminLayout>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{artifact.data.title}</h1>
          <p className="text-sm text-slate-500">
            {artifact.data.kind} · {formatBytes(artifact.data.sizeBytes)} · {formatDate(artifact.data.createdAt)}
          </p>
        </div>
        <div className="flex gap-2">
          <CopyButton value={artifact.data.viewUrl} label="Copy view" />
          <CopyButton value={artifact.data.rawUrl} label="Copy raw" />
        </div>
      </div>
      <form className="mb-5 grid gap-3 border border-slate-200 bg-white p-4 md:grid-cols-2" onSubmit={submit}>
        <input className="h-10 border border-slate-300 px-3" value={title} onChange={(event) => setTitle(event.target.value)} />
        <select className="h-10 border border-slate-300 px-3" value={visibility} onChange={(event) => setVisibility(event.target.value)}>
          <option value="token">token</option>
          <option value="private">private</option>
          <option value="public">public</option>
        </select>
        <textarea className="min-h-20 border border-slate-300 px-3 py-2 md:col-span-2" value={description} onChange={(event) => setDescription(event.target.value)} />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={trustedHtml} onChange={(event) => setTrustedHtml(event.target.checked)} />
          Trusted HTML
        </label>
        <button className="inline-flex h-10 items-center justify-center gap-2 bg-slate-900 px-4 text-sm text-white md:justify-self-end">
          <Save size={16} /> Save
        </button>
      </form>
      <div className="h-[620px] overflow-hidden border border-slate-200 bg-white">
        <ArtifactViewer artifact={artifact.data} />
      </div>
    </AdminLayout>
  );
}
