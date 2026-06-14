# 服务工作台

服务工作台是一个轻量的前后端统一入口。浏览器只访问工作台本身，工作台后端再去访问真实 Web 服务，并通过 `/proxy/:serviceId/` 把目标页面反向代理回来，前端用同源 `iframe` 展示这些服务。

典型使用场景：

- 浏览器不能直接访问内网服务，但运行工作台的服务器可以访问。
- 需要把多个内部 Web 服务放到一个统一入口里。
- 需要用多标签方式在同一页面里切换 Grafana、Prometheus、内部后台等服务。
- 需要对反向代理目标做基础访问控制、健康检查和主机 allowlist。

不适合的场景：

- 需要完整用户、角色、审计和权限模型的企业门户。
- 目标系统强依赖固定根路径、严格 CSP、OAuth 回调或复杂前端路由，并且不能配置 base path。
- 需要代理任意公网地址给不可信用户使用。

## 功能概览

- 从 `config/services.json` 读取服务列表。
- 前端支持新增、编辑、删除服务配置。
- 前端支持搜索服务、多标签打开服务、刷新当前标签、在新窗口打开代理地址。
- 后端通过 `/proxy/:serviceId/` 代理目标服务。
- 支持 WebSocket 代理透传。
- 代理会移除常见禁止嵌入响应头，如 `x-frame-options` 和 CSP。
- 代理会处理重定向、Cookie Path、部分 HTML/CSS/JS 中的绝对路径。
- 支持可选访问令牌 `DASHBOARD_ADMIN_TOKEN`。
- 支持目标主机 allowlist `DASHBOARD_ALLOWED_HOSTS`。
- 默认阻止常见云元数据地址，降低 SSRF 风险。
- 支持代理超时和健康检查超时。
- 健康检查支持并发上限，避免一次性探测过多服务。
- 代理会按请求类型分流，文本响应可重写，明显的静态/二进制资源走流式转发。
- 支持服务健康检查，并在前端列表显示在线、异常、离线或未知状态。

## 目录结构

```text
dashboard/
  config/
    services.json       # 服务配置
  public/
    index.html          # 前端页面
    styles.css          # 前端样式
    app.js              # 前端交互逻辑
  package.json
  server.js             # Express 后端、配置 API、反向代理、健康检查
  README.md
```

## 工作流程

```text
Browser
  |
  | 访问 http://dashboard-host:3000
  v
Express Dashboard
  |
  | 读取 config/services.json
  | 提供 /api/services、/api/statuses
  | 代理 /proxy/:serviceId/*
  v
Target Service
```

打开服务时，前端会创建一个 `iframe`：

```text
/proxy/grafana/
```

后端根据 `grafana` 找到配置里的真实 URL，例如：

```text
http://10.0.0.12:3000
```

之后浏览器仍然只和工作台同源通信，目标服务由工作台后端访问。

## 安装和运行

要求：

- Node.js 20 或更高版本。

安装依赖：

```bash
npm install
```

启动：

```bash
npm start
```

开发模式：

```bash
npm run dev
```

默认访问地址：

```text
http://localhost:3000
```

修改端口：

```bash
PORT=8080 npm start
```

Windows PowerShell：

```powershell
$env:PORT=8080
npm start
```

## 服务配置

服务配置文件默认位置：

```text
config/services.json
```

也可以通过环境变量指定：

```bash
SERVICES_FILE=/data/dashboard/services.json npm start
```

示例：

```json
[
  {
    "id": "grafana",
    "name": "Grafana",
    "url": "http://10.0.0.12:3000",
    "description": "监控面板",
    "healthPath": "/api/health",
    "enabled": true
  }
]
```

字段说明：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | 否 | 服务 ID。用于生成 `/proxy/:serviceId/`。留空时会根据名称或主机名生成。只保留小写字母、数字、`_`、`-`。 |
| `name` | 是 | 前端显示名称。 |
| `url` | 是 | 后端可访问的目标地址，只支持 `http://` 或 `https://`。 |
| `description` | 否 | 前端服务列表中的描述。 |
| `healthPath` | 否 | 健康检查路径，必须是相对路径，例如 `/health`。留空时检查 `/`。 |
| `enabled` | 否 | 是否启用。默认 `true`。设置为 `false` 后不会允许打开和代理。 |

注意：

- `url` 是工作台后端访问的地址，不是浏览器直接访问的地址。
- 如果启用了 `DASHBOARD_ALLOWED_HOSTS`，新增或编辑服务时目标主机必须在 allowlist 内。
- `healthPath` 不能写完整 URL，避免绕过服务目标限制。

## 环境变量

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | HTTP 监听端口。 |
| `SERVICES_FILE` | `config/services.json` | 服务配置文件路径。 |
| `DASHBOARD_ADMIN_TOKEN` | 空 | 访问令牌。为空时不启用认证。 |
| `DASHBOARD_SESSION_TTL_SECONDS` | `86400` | 登录 cookie 有效期。 |
| `DASHBOARD_COOKIE_SECURE` | 空 | 设置为 `true` 时 cookie 带 `Secure`，HTTPS 部署时建议开启。 |
| `DASHBOARD_ALLOWED_HOSTS` | 空 | 目标主机 allowlist，逗号分隔。支持 `host`、`host:port`、`*.example.com`。为空时不限制。 |
| `DASHBOARD_BLOCKED_HOSTS` | 云元数据地址 | 默认阻止 `169.254.169.254` 等常见元数据主机。 |
| `DASHBOARD_ALLOW_METADATA_PROXY` | 空 | 设置为 `true` 时允许代理默认阻止的元数据主机。通常不要开启。 |
| `DASHBOARD_PROXY_TIMEOUT_MS` | `30000` | 代理连接和上游响应超时。 |
| `DASHBOARD_STATUS_TIMEOUT_MS` | `5000` | 健康检查超时。 |
| `DASHBOARD_STATUS_CONCURRENCY` | `8` | 批量健康检查最大并发。 |

推荐部署配置：

```bash
DASHBOARD_ADMIN_TOKEN=change-me
DASHBOARD_ALLOWED_HOSTS=10.0.0.12,10.0.0.13,*.internal.example.com
DASHBOARD_PROXY_TIMEOUT_MS=30000
DASHBOARD_STATUS_TIMEOUT_MS=5000
npm start
```

## 认证方式

启用 `DASHBOARD_ADMIN_TOKEN` 后：

- 前端会显示登录框。
- 登录成功后后端设置 HttpOnly cookie：`dashboard_session`。
- `/api/*`、`/proxy/*` 和 WebSocket 代理都需要认证。

也可以用请求头访问 API：

```text
Authorization: Bearer <DASHBOARD_ADMIN_TOKEN>
```

或：

```text
x-dashboard-token: <DASHBOARD_ADMIN_TOKEN>
```

登出会清除 cookie：

```http
DELETE /api/session
```

## API

### 健康检查

```http
GET /healthz
```

返回工作台自身状态：

```json
{
  "ok": true,
  "services": 1,
  "authRequired": true
}
```

### 登录状态

```http
GET /api/session
```

返回：

```json
{
  "authRequired": true,
  "authenticated": true
}
```

### 登录

```http
POST /api/session
Content-Type: application/json

{
  "token": "change-me"
}
```

成功返回 `204`，并设置 HttpOnly cookie。

### 登出

```http
DELETE /api/session
```

成功返回 `204`。

### 服务列表

```http
GET /api/services
```

返回服务数组。

### 新增服务

```http
POST /api/services
Content-Type: application/json

{
  "id": "grafana",
  "name": "Grafana",
  "url": "http://10.0.0.12:3000",
  "description": "监控面板",
  "healthPath": "/api/health",
  "enabled": true
}
```

### 更新服务

```http
PUT /api/services/:id
Content-Type: application/json
```

请求体字段同新增服务。

### 删除服务

```http
DELETE /api/services/:id
```

成功返回 `204`。

### 批量服务状态

```http
GET /api/statuses
```

返回：

```json
{
  "data": [
    {
      "id": "grafana",
      "state": "online",
      "statusCode": 200,
      "latencyMs": 37,
      "checkedAt": "2026-06-09T12:00:00.000Z",
      "target": "http://10.0.0.12:3000/api/health"
    }
  ]
}
```

`state` 取值：

| 状态 | 含义 |
| --- | --- |
| `online` | HTTP 状态码为 2xx。 |
| `degraded` | HTTP 状态码为 3xx 或 4xx。服务可达，但健康检查路径可能重定向、需要认证或返回业务错误。 |
| `offline` | 连接失败、超时或 5xx。 |
| `unknown` | 前端尚未获取状态。 |

### 单服务状态

```http
GET /api/services/:id/status
```

### 代理服务

```http
GET /proxy/:serviceId/
```

服务 ID 必须存在且启用。未认证或服务不存在会返回错误。

## 部署建议

### 本地或内网测试

```bash
PORT=3000 npm start
```

### 共享网络

```bash
PORT=3000
DASHBOARD_ADMIN_TOKEN=long-random-token
DASHBOARD_ALLOWED_HOSTS=*.internal.example.com,10.0.0.12
npm start
```

### 反向代理后面运行

建议外层使用 Nginx、Caddy 或 Ingress 提供 HTTPS。HTTPS 部署时设置：

```bash
DASHBOARD_COOKIE_SECURE=true
```

## 安全说明

反向代理服务天然有 SSRF 风险，因为用户如果能新增任意 `url`，就可能让后端访问不该访问的地址。

建议：

- 不要把未设置 `DASHBOARD_ADMIN_TOKEN` 的工作台暴露给多人网络。
- 生产环境设置 `DASHBOARD_ALLOWED_HOSTS`。
- 不要允许普通用户编辑服务配置。
- 不要关闭默认的云元数据地址阻断。
- 在网络层限制工作台服务器能访问的目标范围。
- 对 `config/services.json` 做备份和权限控制。
- 只代理可信服务。工作台会为了嵌入页面移除目标响应的部分 frame/CSP 限制；如果被代理服务本身存在 XSS，可能影响工作台同源代理页面。
- 更严格的生产隔离方案是把代理页面部署到独立子域名，例如 `proxy.example.com`，与管理面板域名分开。

## 能力边界

通用反向代理无法保证所有 Web 应用都能被 iframe 正常嵌入。

可能需要额外处理的情况：

- 目标服务强制设置自己的 `base href`。
- 前端路由假定自己部署在 `/`。
- 登录回调固定写死为目标域名。
- 目标服务使用严格 CSP 或动态 JS 拼接绝对 URL。
- 目标服务使用跨域 Cookie、SameSite 或第三方登录。
- 目标服务需要在 sandboxed iframe 中访问完整同源能力。工作台默认给 iframe 设置了 sandbox，但为了兼容脚本、表单和弹窗，仍不应把不可信页面加入代理列表。

遇到这些情况时，优先在目标服务上配置 base path 或 reverse proxy mode。如果目标服务支持子路径部署，通常比通用字符串重写更稳定。

## 验证

语法检查：

```bash
node --check server.js
node --check public/app.js
```

启动后检查自身状态：

```bash
curl http://127.0.0.1:3000/healthz
```

启用认证后验证未登录访问：

```bash
curl -i http://127.0.0.1:3000/api/services
```

登录：

```bash
curl -i -X POST http://127.0.0.1:3000/api/session \
  -H 'content-type: application/json' \
  --data '{"token":"change-me"}'
```

## 常见问题

### 页面空白或资源 404

目标服务可能强依赖根路径。检查浏览器开发者工具里的资源 URL。如果大量资源仍指向目标服务原始域名或 `/static/*`，需要给目标服务配置 base path，或补充专门的重写规则。

### 登录后目标服务仍然跳回原地址

目标服务可能写死了登录回调地址、Cookie Domain 或 OAuth redirect URI。需要在目标服务配置里把外部访问地址设置成工作台代理地址。

### 健康检查显示 degraded

`degraded` 通常表示目标服务可达，但健康检查路径返回 4xx。可以把 `healthPath` 换成无需认证的 `/health`、`/ready` 或 `/api/health`。

### 新增服务时报 host not allowed

说明启用了 `DASHBOARD_ALLOWED_HOSTS`，但服务 URL 的主机不在 allowlist 中。把目标主机加入 allowlist，或确认是否不应该允许这个目标。
