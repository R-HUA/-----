type ApiEnvelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string; details?: unknown } };

export async function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: "GET" });
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}

export async function apiDelete<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: "DELETE" });
}

async function apiRequest<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: init.body ? { "Content-Type": "application/json", ...(init.headers || {}) } : init.headers,
    ...init
  });
  const payload = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !payload.ok) {
    const message = payload.ok ? response.statusText : payload.error.message;
    throw new Error(message);
  }
  return payload.data;
}

export function tokenQuery(search: string): string {
  const token = new URLSearchParams(search).get("t");
  return token ? `?t=${encodeURIComponent(token)}` : "";
}

export function withToken(path: string, search: string): string {
  const token = tokenQuery(search);
  return token ? `${path}${token}` : path;
}
