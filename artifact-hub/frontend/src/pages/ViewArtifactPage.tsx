import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "react-router-dom";
import { getViewArtifact } from "../api/viewApi";
import { ArtifactSidebar } from "../components/ArtifactSidebar";
import { TopBar } from "../components/TopBar";
import { ArtifactViewer } from "../viewers/ArtifactViewer";

export function ViewArtifactPage() {
  const { artifactId = "" } = useParams();
  const location = useLocation();
  const { data, isLoading, error } = useQuery({
    queryKey: ["view-artifact", artifactId, location.search],
    queryFn: () => getViewArtifact(artifactId, location.search)
  });
  if (isLoading) return <div className="p-6 text-sm text-slate-500">Loading artifact...</div>;
  if (error || !data) return <div className="p-6 text-sm text-red-700">Unable to load artifact.</div>;
  return (
    <div className="h-screen bg-slate-100">
      <TopBar artifact={data} />
      <div className="viewer-shell flex">
        <div className="hidden md:block">
          <ArtifactSidebar artifacts={data.siblings} activeId={data.artifactId} />
        </div>
        <main className="min-w-0 flex-1">
          <ArtifactViewer artifact={data} />
        </main>
      </div>
    </div>
  );
}
