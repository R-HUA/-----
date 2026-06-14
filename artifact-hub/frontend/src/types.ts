export type ArtifactKind =
  | "markdown"
  | "html"
  | "html-bundle"
  | "image"
  | "svg"
  | "pdf"
  | "json"
  | "csv"
  | "text"
  | "junit"
  | "archive"
  | "binary";

export type ArtifactSummary = {
  artifactId: string;
  sessionId: string;
  title: string;
  filename: string;
  kind: ArtifactKind;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  viewUrl: string;
};

export type ViewSession = {
  sessionId: string;
  title?: string | null;
  source?: string | null;
  createdAt: string;
  updatedAt: string;
  artifacts: ArtifactSummary[];
};

export type ViewArtifact = {
  artifactId: string;
  sessionId: string;
  title: string;
  description?: string | null;
  filename: string;
  kind: ArtifactKind;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
  contentUrl: string;
  downloadUrl: string;
  trustedHtml: boolean;
  entryPath?: string | null;
  siblings: ArtifactSummary[];
};

export type AdminSessionSummary = {
  sessionId: string;
  title?: string | null;
  source?: string | null;
  artifactCount: number;
  totalSizeBytes: number;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string | null;
  sessionUrl: string;
};

export type AdminArtifact = ViewArtifact & {
  storagePath: string;
  visibility: "private" | "token" | "public";
  metadata: Record<string, unknown>;
  viewUrl: string;
  rawUrl: string;
};

export type ApiKeyRecord = {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
};
