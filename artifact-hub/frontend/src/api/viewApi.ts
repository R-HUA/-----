import { apiGet, withToken } from "./client";
import type { ViewArtifact, ViewSession } from "../types";

export function getViewSession(sessionId: string, search: string): Promise<ViewSession> {
  return apiGet<ViewSession>(withToken(`/api/v1/view/sessions/${encodeURIComponent(sessionId)}`, search));
}

export function getViewArtifact(artifactId: string, search: string): Promise<ViewArtifact> {
  return apiGet<ViewArtifact>(withToken(`/api/v1/view/artifacts/${encodeURIComponent(artifactId)}`, search));
}
