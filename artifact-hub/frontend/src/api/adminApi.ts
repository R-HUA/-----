import { apiDelete, apiGet, apiPatch, apiPost } from "./client";
import type { AdminArtifact, AdminSessionSummary, ApiKeyRecord } from "../types";

export type AdminSessionDetail = {
  sessionId: string;
  title?: string | null;
  source?: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string | null;
  metadata: Record<string, unknown>;
  sessionUrl: string;
  artifacts: AdminArtifact[];
};

export function adminMe(): Promise<{ authenticated: boolean }> {
  return apiGet("/api/v1/admin/me");
}

export function adminLogin(password: string): Promise<{ authenticated: boolean }> {
  return apiPost("/api/v1/admin/login", { password });
}

export function adminLogout(): Promise<{ authenticated: boolean }> {
  return apiPost("/api/v1/admin/logout");
}

export function listSessions(q?: string): Promise<{ sessions: AdminSessionSummary[] }> {
  const query = q ? `?q=${encodeURIComponent(q)}` : "";
  return apiGet(`/api/v1/admin/sessions${query}`);
}

export function getSession(sessionId: string): Promise<AdminSessionDetail> {
  return apiGet(`/api/v1/admin/sessions/${encodeURIComponent(sessionId)}`);
}

export function getArtifact(artifactId: string): Promise<AdminArtifact> {
  return apiGet(`/api/v1/admin/artifacts/${encodeURIComponent(artifactId)}`);
}

export function updateSession(sessionId: string, body: Record<string, unknown>): Promise<{ updated: boolean }> {
  return apiPatch(`/api/v1/admin/sessions/${encodeURIComponent(sessionId)}`, body);
}

export function deleteSession(sessionId: string): Promise<{ deleted: boolean }> {
  return apiDelete(`/api/v1/admin/sessions/${encodeURIComponent(sessionId)}`);
}

export function rotateSessionToken(sessionId: string): Promise<{ sessionUrl: string }> {
  return apiPost(`/api/v1/admin/sessions/${encodeURIComponent(sessionId)}/rotate-token`);
}

export function updateArtifact(artifactId: string, body: Record<string, unknown>): Promise<{ updated: boolean }> {
  return apiPatch(`/api/v1/admin/artifacts/${encodeURIComponent(artifactId)}`, body);
}

export function deleteArtifact(artifactId: string): Promise<{ deleted: boolean }> {
  return apiDelete(`/api/v1/admin/artifacts/${encodeURIComponent(artifactId)}`);
}

export function listApiKeys(): Promise<{ apiKeys: ApiKeyRecord[] }> {
  return apiGet("/api/v1/admin/api-keys");
}

export function createApiKey(name: string, scopes: string[]): Promise<{ id: string; key: string; keyPrefix: string; scopes: string[] }> {
  return apiPost("/api/v1/admin/api-keys", { name, scopes });
}

export function revokeApiKey(id: string): Promise<{ revoked: boolean }> {
  return apiDelete(`/api/v1/admin/api-keys/${encodeURIComponent(id)}`);
}

export function getSystem(): Promise<{ version: string; publicBaseUrl: string; dataDir: string; database: string; storageBytes: number }> {
  return apiGet("/api/v1/admin/system");
}

export function cleanup(olderThanDays: number, dryRun = false): Promise<{ deletedArtifacts: number; matchedArtifacts?: number; dryRun: boolean }> {
  return apiPost("/api/v1/admin/cleanup", { olderThanDays, dryRun });
}
