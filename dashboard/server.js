const fs = require("fs/promises");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const express = require("express");
const { createProxyMiddleware, responseInterceptor } = require("http-proxy-middleware");

const app = express();
const server = http.createServer(app);

const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const CONFIG_DIR = path.join(ROOT_DIR, "config");
const SERVICES_FILE = process.env.SERVICES_FILE || path.join(CONFIG_DIR, "services.json");
const ADMIN_TOKEN = process.env.DASHBOARD_ADMIN_TOKEN || "";
const SESSION_COOKIE_NAME = "dashboard_session";
const SESSION_TTL_SECONDS = Number(process.env.DASHBOARD_SESSION_TTL_SECONDS || 86400);
const COOKIE_SECURE = ["1", "true", "yes", "on"].includes(String(process.env.DASHBOARD_COOKIE_SECURE || "").toLowerCase());
const STATUS_TIMEOUT_MS = Number(process.env.DASHBOARD_STATUS_TIMEOUT_MS || 5000);
const PROXY_TIMEOUT_MS = Number(process.env.DASHBOARD_PROXY_TIMEOUT_MS || 30000);
const STATUS_CONCURRENCY = Math.max(1, Number(process.env.DASHBOARD_STATUS_CONCURRENCY || 8));
const ALLOWED_TARGET_HOSTS = parseCsv(process.env.DASHBOARD_ALLOWED_HOSTS);
const BLOCKED_TARGET_HOSTS = new Set(parseCsv(process.env.DASHBOARD_BLOCKED_HOSTS || "169.254.169.254,169.254.170.2,100.100.100.200,metadata.google.internal"));
const ALLOW_METADATA_PROXY = ["1", "true", "yes", "on"].includes(String(process.env.DASHBOARD_ALLOW_METADATA_PROXY || "").toLowerCase());

const serviceProxies = new Map();
const sessions = new Map();
let cachedServices = [];

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function cleanServiceId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function normalizeBaseUrl(rawUrl) {
  const parsed = new URL(String(rawUrl || "").trim());
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http:// and https:// service URLs are supported.");
  }
  assertTargetAllowed(parsed);
  parsed.hash = "";
  parsed.search = "";
  return parsed.toString().replace(/\/$/, "");
}

function publicService(service) {
  return {
    id: service.id,
    name: service.name,
    url: service.url,
    description: service.description || "",
    healthPath: service.healthPath || "",
    enabled: service.enabled !== false
  };
}

function cleanHeaderText(value, fallback = "") {
  return String(value || fallback)
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHealthPath(rawPath) {
  const value = String(rawPath || "").trim();
  if (!value) {
    return "";
  }
  if (/^https?:\/\//i.test(value)) {
    throw new Error("Service healthPath must be relative to the service URL.");
  }
  return value.startsWith("/") ? value : `/${value}`;
}

function normalizeHost(value) {
  return String(value || "").trim().toLowerCase().replace(/\.$/, "");
}

function hostMatchesPattern(hostname, hostWithPort, pattern) {
  const normalizedPattern = normalizeHost(pattern);
  const normalizedHost = normalizeHost(hostname);
  const normalizedHostWithPort = normalizeHost(hostWithPort);
  if (!normalizedPattern) {
    return false;
  }
  if (normalizedPattern === "*") {
    return true;
  }
  if (normalizedPattern.startsWith("*.")) {
    const suffix = normalizedPattern.slice(1);
    return normalizedHost.endsWith(suffix) && normalizedHost.length > suffix.length;
  }
  return normalizedPattern === normalizedHost || normalizedPattern === normalizedHostWithPort;
}

function assertTargetAllowed(parsedUrl) {
  const hostname = normalizeHost(parsedUrl.hostname);
  const hostWithPort = normalizeHost(parsedUrl.host);
  if (!ALLOW_METADATA_PROXY && BLOCKED_TARGET_HOSTS.has(hostname)) {
    throw new Error(`Service URL host is blocked: ${hostname}`);
  }
  if (!ALLOWED_TARGET_HOSTS.length) {
    return;
  }
  const allowed = ALLOWED_TARGET_HOSTS.some((pattern) => hostMatchesPattern(hostname, hostWithPort, pattern));
  if (!allowed) {
    throw new Error(`Service URL host is not allowed by DASHBOARD_ALLOWED_HOSTS: ${hostWithPort}`);
  }
}

async function ensureConfigFile() {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  try {
    await fs.access(SERVICES_FILE);
  } catch {
    await fs.writeFile(SERVICES_FILE, "[]\n", "utf8");
  }
}

async function readServices() {
  await ensureConfigFile();
  const raw = await fs.readFile(SERVICES_FILE, "utf8");
  const parsed = raw.trim() ? JSON.parse(raw) : [];
  if (!Array.isArray(parsed)) {
    throw new Error("services.json must contain an array.");
  }

  const ids = new Set();
  return parsed.map((item) => {
    const name = cleanHeaderText(item.name);
    const url = normalizeBaseUrl(item.url);
    const id = cleanServiceId(item.id || name || new URL(url).hostname);
    if (!id) {
      throw new Error("Every service needs an id or a name.");
    }
    if (ids.has(id)) {
      throw new Error(`Duplicate service id: ${id}`);
    }
    ids.add(id);
    return {
      id,
      name: name || id,
      url,
      description: cleanHeaderText(item.description),
      healthPath: normalizeHealthPath(item.healthPath),
      enabled: item.enabled ?? true
    };
  });
}

async function writeServices(services) {
  await fs.mkdir(path.dirname(SERVICES_FILE), { recursive: true });
  await fs.writeFile(SERVICES_FILE, `${JSON.stringify(services.map(publicService), null, 2)}\n`, "utf8");
  cachedServices = await readServices();
  serviceProxies.clear();
}

async function loadServices() {
  cachedServices = await readServices();
  return cachedServices;
}

function getService(id) {
  return cachedServices.find((service) => service.id === id && service.enabled !== false);
}

function parseCookies(cookieHeader) {
  const cookies = {};
  for (const part of String(cookieHeader || "").split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (!name || !rest.length) {
      continue;
    }
    try {
      cookies[name] = decodeURIComponent(rest.join("="));
    } catch {
      // Ignore malformed cookie values instead of failing the request.
    }
  }
  return cookies;
}

function timingSafeEqualString(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function tokenFromRequest(req) {
  const bearer = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice("Bearer ".length)
    : "";
  const headerToken = req.headers["x-admin-token"] || req.headers["x-dashboard-token"] || bearer;
  if (headerToken) {
    return String(headerToken);
  }
  const sessionId = parseCookies(req.headers.cookie)[SESSION_COOKIE_NAME] || "";
  if (!sessionId) {
    return "";
  }
  const session = sessions.get(sessionId);
  if (!session) {
    return "";
  }
  if (session.expiresAt && session.expiresAt <= Date.now()) {
    sessions.delete(sessionId);
    return "";
  }
  return session.token;
}

function hasDashboardAccess(req) {
  if (!ADMIN_TOKEN) {
    return true;
  }
  return timingSafeEqualString(tokenFromRequest(req), ADMIN_TOKEN);
}

function requireDashboardAccess(req, res, next) {
  if (hasDashboardAccess(req)) {
    return next();
  }
  return res.status(401).json({
    error: "auth_required",
    message: "Dashboard authentication is required."
  });
}

function sessionCookie(token) {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax"
  ];
  if (Number.isFinite(SESSION_TTL_SECONDS) && SESSION_TTL_SECONDS > 0) {
    parts.push(`Max-Age=${SESSION_TTL_SECONDS}`);
  }
  if (COOKIE_SECURE) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

function createSession(token) {
  const sessionId = crypto.randomUUID();
  const ttlMs = Number.isFinite(SESSION_TTL_SECONDS) && SESSION_TTL_SECONDS > 0
    ? SESSION_TTL_SECONDS * 1000
    : 0;
  sessions.set(sessionId, {
    token,
    createdAt: Date.now(),
    expiresAt: ttlMs ? Date.now() + ttlMs : 0
  });
  return sessionId;
}

function deleteSession(req) {
  const sessionId = parseCookies(req.headers.cookie)[SESSION_COOKIE_NAME];
  if (sessionId) {
    sessions.delete(sessionId);
  }
}

function clearSessionCookie() {
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${COOKIE_SECURE ? "; Secure" : ""}`;
}

function getProxyPrefix(serviceId) {
  return `/proxy/${encodeURIComponent(serviceId)}`;
}

function proxiedPath(serviceId, rawPath) {
  const pathPart = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  return `${getProxyPrefix(serviceId)}${pathPart}`;
}

function absoluteProxyUrl(serviceId, rawUrl) {
  const parsed = new URL(rawUrl);
  return `${getProxyPrefix(serviceId)}${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function rewriteCssUrls(serviceId, targetOrigin, body) {
  return body.replace(/url\(\s*(['"]?)(\/(?!\/)[^)'"#?][^)'"?]*)([^)'"]*)\1\s*\)/gi, (match, quote, pathname, suffix) => {
    return `url(${quote}${proxiedPath(serviceId, `${pathname}${suffix || ""}`)}${quote})`;
  }).replaceAll(`${targetOrigin}/`, `${getProxyPrefix(serviceId)}/`);
}

function rewriteHtml(serviceId, targetBase, body) {
  const target = new URL(targetBase);
  const targetOrigin = target.origin;
  let rewritten = body.replace(/(<\s*(?:a|link|script|img|iframe|form|source|video|audio|embed|object)\b[^>]*?\s(?:href|src|action|data|poster)=)(["'])(\/(?!\/)[^"']*)\2/gi, (match, prefix, quote, value) => {
    return `${prefix}${quote}${proxiedPath(serviceId, value)}${quote}`;
  });

  rewritten = rewritten.replace(/(<\s*base\b[^>]*>)/i, "");
  rewritten = rewritten.replaceAll(`${targetOrigin}/`, `${getProxyPrefix(serviceId)}/`);
  rewritten = rewriteCssUrls(serviceId, targetOrigin, rewritten);

  if (/<head[^>]*>/i.test(rewritten)) {
    return rewritten.replace(/<head([^>]*)>/i, `<head$1><base href="${getProxyPrefix(serviceId)}/">`);
  }
  return `<base href="${getProxyPrefix(serviceId)}/">${rewritten}`;
}

function rewriteTextResponse(serviceId, targetBase, proxyRes, responseBuffer) {
  const contentType = String(proxyRes.headers["content-type"] || "").toLowerCase();
  const body = responseBuffer.toString("utf8");
  const targetOrigin = new URL(targetBase).origin;

  if (contentType.includes("text/html") || contentType.includes("application/xhtml+xml")) {
    return rewriteHtml(serviceId, targetBase, body);
  }
  if (contentType.includes("text/css")) {
    return rewriteCssUrls(serviceId, targetOrigin, body);
  }
  if (contentType.includes("javascript") || contentType.includes("application/json")) {
    return body.replaceAll(`${targetOrigin}/`, `${getProxyPrefix(serviceId)}/`);
  }
  return responseBuffer;
}

function removeHeader(headers, name) {
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === name) {
      delete headers[key];
    }
  }
}

function rewriteResponseHeaders(serviceId, targetBase, proxyRes) {
  removeHeader(proxyRes.headers, "x-frame-options");
  removeHeader(proxyRes.headers, "content-security-policy");
  removeHeader(proxyRes.headers, "content-security-policy-report-only");

  const location = proxyRes.headers.location;
  if (location) {
    try {
      const resolved = new URL(location, targetBase);
      proxyRes.headers.location = absoluteProxyUrl(serviceId, resolved.toString());
    } catch {
      // Leave malformed Location headers untouched.
    }
  }

  const cookies = proxyRes.headers["set-cookie"];
  if (Array.isArray(cookies)) {
    proxyRes.headers["set-cookie"] = cookies.map((cookie) => {
      let next = cookie.replace(/;\s*domain=[^;]*/gi, "");
      if (/;\s*path=/i.test(next)) {
        next = next.replace(/;\s*path=[^;]*/i, `; Path=${getProxyPrefix(serviceId)}`);
      } else {
        next += `; Path=${getProxyPrefix(serviceId)}`;
      }
      return next;
    });
  }
}

function shouldRewriteProxyBody(req) {
  const pathname = new URL(req.originalUrl || req.url || "/", "http://dashboard.local").pathname.toLowerCase();
  const ext = path.extname(pathname);
  if ([".html", ".htm", ".css", ".js", ".mjs", ".json", ".xhtml"].includes(ext)) {
    return true;
  }
  if (ext && ![".php", ".asp", ".aspx", ".jsp"].includes(ext)) {
    return false;
  }

  const accept = String(req.headers.accept || "").toLowerCase();
  if (!accept || accept.includes("*/*")) {
    return true;
  }
  return ["text/html", "application/xhtml+xml", "text/css", "javascript", "application/json"].some((type) => accept.includes(type));
}

function baseProxyOptions(service) {
  return {
    target: service.url,
    changeOrigin: true,
    ws: true,
    xfwd: true,
    timeout: PROXY_TIMEOUT_MS,
    proxyTimeout: PROXY_TIMEOUT_MS,
    pathRewrite: (requestPath) => requestPath || "/",
    on: {
      proxyReq: (proxyReq, req) => {
        proxyReq.setHeader("x-dashboard-service-id", service.id);
        proxyReq.setHeader("x-dashboard-service-name", service.name);
        proxyReq.setHeader("referer", service.url);
        if (req.headers.origin) {
          proxyReq.setHeader("origin", new URL(service.url).origin);
        }
      },
      proxyRes: (proxyRes) => {
        rewriteResponseHeaders(service.id, service.url, proxyRes);
      },
      error: (err, req, res) => {
        if (res.headersSent) {
          return;
        }
        res.status(502).json({
          error: "proxy_failed",
          message: err.message,
          serviceId: service.id
        });
      }
    }
  };
}

function createServiceProxy(service, rewriteBody) {
  if (!rewriteBody) {
    return createProxyMiddleware(baseProxyOptions(service));
  }

  const options = baseProxyOptions(service);
  return createProxyMiddleware({
    ...options,
    selfHandleResponse: true,
    on: {
      ...options.on,
      proxyRes: responseInterceptor(async (responseBuffer, proxyRes) => {
        rewriteResponseHeaders(service.id, service.url, proxyRes);
        return rewriteTextResponse(service.id, service.url, proxyRes, responseBuffer);
      }),
    }
  });
}

function getServiceProxy(service, rewriteBody = true) {
  const key = `${service.id}:${rewriteBody ? "rewrite" : "stream"}`;
  if (!serviceProxies.has(key)) {
    serviceProxies.set(key, createServiceProxy(service, rewriteBody));
  }
  return serviceProxies.get(key);
}

function statusState(statusCode) {
  if (statusCode >= 200 && statusCode < 300) {
    return "online";
  }
  if (statusCode >= 300 && statusCode < 500) {
    return "degraded";
  }
  return "offline";
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function checkServiceStatus(service) {
  const targetUrl = new URL(service.healthPath || "/", `${service.url}/`).toString();
  const startedAt = Date.now();
  const checkedAt = new Date().toISOString();
  const methods = ["HEAD", "GET"];

  for (const method of methods) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), STATUS_TIMEOUT_MS);
    try {
      const response = await fetch(targetUrl, {
        method,
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "user-agent": "service-dashboard/0.1"
        }
      });
      await response.body?.cancel?.();
      const latencyMs = Date.now() - startedAt;
      if (method === "HEAD" && response.status === 405) {
        continue;
      }
      return {
        id: service.id,
        state: statusState(response.status),
        statusCode: response.status,
        latencyMs,
        checkedAt,
        target: targetUrl
      };
    } catch (err) {
      if (method === "HEAD" && err.name !== "AbortError") {
        continue;
      }
      return {
        id: service.id,
        state: "offline",
        statusCode: null,
        latencyMs: Date.now() - startedAt,
        checkedAt,
        target: targetUrl,
        error: err.name === "AbortError" ? "status_check_timeout" : err.message
      };
    } finally {
      clearTimeout(timer);
    }
  }

}

app.get("/healthz", (req, res) => {
  res.json({
    ok: true,
    services: cachedServices.length,
    authRequired: Boolean(ADMIN_TOKEN)
  });
});

app.get("/api/session", (req, res) => {
  res.json({
    authRequired: Boolean(ADMIN_TOKEN),
    authenticated: hasDashboardAccess(req)
  });
});

app.post("/api/session", (req, res) => {
  if (!ADMIN_TOKEN) {
    return res.status(204).end();
  }
  if (!timingSafeEqualString(req.body?.token, ADMIN_TOKEN)) {
    return res.status(401).json({ error: "invalid_token", message: "Invalid dashboard token." });
  }
  res.setHeader("set-cookie", sessionCookie(createSession(ADMIN_TOKEN)));
  return res.status(204).end();
});

app.delete("/api/session", (req, res) => {
  deleteSession(req);
  res.setHeader("set-cookie", clearSessionCookie());
  res.status(204).end();
});

app.use((req, res, next) => {
  if (req.path.startsWith("/api/") || req.path === "/api" || req.path.startsWith("/proxy/") || /^\/proxy\/[^/]+$/.test(req.path)) {
    return requireDashboardAccess(req, res, next);
  }
  return next();
});

app.get("/api/services", (req, res) => {
  res.json(cachedServices.map(publicService));
});

app.get("/api/statuses", async (req, res) => {
  const services = cachedServices.filter((service) => service.enabled !== false);
  const data = await mapWithConcurrency(services, STATUS_CONCURRENCY, (service) => checkServiceStatus(service));
  res.json({ data });
});

app.get("/api/services/:id/status", async (req, res) => {
  const service = getService(req.params.id);
  if (!service) {
    return res.status(404).json({ error: "not_found", message: "Service not found or disabled." });
  }
  res.json(await checkServiceStatus(service));
});

app.post("/api/services", async (req, res) => {
  try {
    const services = await readServices();
    const id = cleanServiceId(req.body.id || req.body.name);
    const service = {
      id,
      name: cleanHeaderText(req.body.name, id),
      url: normalizeBaseUrl(req.body.url),
      description: cleanHeaderText(req.body.description),
      healthPath: normalizeHealthPath(req.body.healthPath),
      enabled: req.body.enabled ?? true
    };
    if (!service.id || !service.name) {
      return res.status(400).json({ error: "invalid_service", message: "Service id and name are required." });
    }
    if (services.some((item) => item.id === service.id)) {
      return res.status(409).json({ error: "duplicate_service", message: `Service id already exists: ${service.id}` });
    }
    services.push(service);
    await writeServices(services);
    res.status(201).json(publicService(service));
  } catch (err) {
    res.status(400).json({ error: "invalid_service", message: err.message });
  }
});

app.put("/api/services/:id", async (req, res) => {
  try {
    const services = await readServices();
    const index = services.findIndex((service) => service.id === req.params.id);
    if (index === -1) {
      return res.status(404).json({ error: "not_found", message: "Service not found." });
    }

    const current = services[index];
    const nextId = cleanServiceId(req.body.id || current.id);
    const updated = {
      id: nextId,
      name: cleanHeaderText(req.body.name ?? current.name, current.name),
      url: normalizeBaseUrl(req.body.url || current.url),
      description: cleanHeaderText(req.body.description ?? current.description ?? ""),
      healthPath: normalizeHealthPath(req.body.healthPath ?? current.healthPath),
      enabled: req.body.enabled ?? current.enabled ?? true
    };
    if (services.some((service, itemIndex) => itemIndex !== index && service.id === updated.id)) {
      return res.status(409).json({ error: "duplicate_service", message: `Service id already exists: ${updated.id}` });
    }
    services[index] = updated;
    await writeServices(services);
    res.json(publicService(updated));
  } catch (err) {
    res.status(400).json({ error: "invalid_service", message: err.message });
  }
});

app.delete("/api/services/:id", async (req, res) => {
  const services = await readServices();
  const remaining = services.filter((service) => service.id !== req.params.id);
  if (remaining.length === services.length) {
    return res.status(404).json({ error: "not_found", message: "Service not found." });
  }
  await writeServices(remaining);
  res.status(204).end();
});

app.get(/^\/proxy\/([^/]+)$/, (req, res) => {
  res.redirect(302, `${getProxyPrefix(req.params[0])}/`);
});

app.use("/proxy/:serviceId", (req, res, next) => {
  const service = getService(req.params.serviceId);
  if (!service) {
    return res.status(404).send("Service is not configured or disabled.");
  }
  return getServiceProxy(service, shouldRewriteProxyBody(req))(req, res, next);
});

app.use(express.static(PUBLIC_DIR));
app.get("*", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

server.on("upgrade", (req, socket, head) => {
  if (!hasDashboardAccess(req)) {
    socket.destroy();
    return;
  }
  const match = req.url.match(/^\/proxy\/([^/?#]+)/);
  const serviceId = match ? decodeURIComponent(match[1]) : "";
  const service = getService(serviceId);
  if (!service) {
    socket.destroy();
    return;
  }
  getServiceProxy(service, false).upgrade(req, socket, head);
});

loadServices()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Dashboard running at http://localhost:${PORT}`);
      console.log(`Service config: ${SERVICES_FILE}`);
    });
  })
  .catch((err) => {
    console.error("Failed to start dashboard:", err);
    process.exit(1);
  });
