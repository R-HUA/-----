const fs = require("fs/promises");
const path = require("path");
const http = require("http");
const express = require("express");
const { createProxyMiddleware, responseInterceptor } = require("http-proxy-middleware");

const app = express();
const server = http.createServer(app);

const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const CONFIG_DIR = path.join(ROOT_DIR, "config");
const SERVICES_FILE = process.env.SERVICES_FILE || path.join(CONFIG_DIR, "services.json");

const serviceProxies = new Map();
let cachedServices = [];

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

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
    enabled: service.enabled !== false
  };
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
    const name = String(item.name || "").trim();
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
      description: String(item.description || "").trim(),
      enabled: item.enabled !== false
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

function createServiceProxy(service) {
  return createProxyMiddleware({
    target: service.url,
    changeOrigin: true,
    ws: true,
    xfwd: true,
    selfHandleResponse: true,
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
      proxyRes: responseInterceptor(async (responseBuffer, proxyRes) => {
        rewriteResponseHeaders(service.id, service.url, proxyRes);
        return rewriteTextResponse(service.id, service.url, proxyRes, responseBuffer);
      }),
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
  });
}

function getServiceProxy(service) {
  if (!serviceProxies.has(service.id)) {
    serviceProxies.set(service.id, createServiceProxy(service));
  }
  return serviceProxies.get(service.id);
}

app.get("/api/services", (req, res) => {
  res.json(cachedServices.map(publicService));
});

app.post("/api/services", async (req, res) => {
  try {
    const services = await readServices();
    const id = cleanServiceId(req.body.id || req.body.name);
    const service = {
      id,
      name: String(req.body.name || id).trim(),
      url: normalizeBaseUrl(req.body.url),
      description: String(req.body.description || "").trim(),
      enabled: req.body.enabled !== false
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
      name: String(req.body.name || current.name).trim(),
      url: normalizeBaseUrl(req.body.url || current.url),
      description: String(req.body.description ?? current.description ?? "").trim(),
      enabled: req.body.enabled !== false
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
  return getServiceProxy(service)(req, res, next);
});

app.use(express.static(PUBLIC_DIR));
app.get("*", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

server.on("upgrade", (req, socket, head) => {
  const match = req.url.match(/^\/proxy\/([^/?#]+)/);
  const serviceId = match ? decodeURIComponent(match[1]) : "";
  const service = getService(serviceId);
  if (!service) {
    socket.destroy();
    return;
  }
  getServiceProxy(service).upgrade(req, socket, head);
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
    process.exitCode = 1;
  });
