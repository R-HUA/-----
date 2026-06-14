# OpenAI Image Approval Proxy

OpenAI Image Approval Proxy 是一个兼容 OpenAI Images API 的图片代理服务。客户端仍然调用熟悉的 `/v1/images/generations`、`/v1/images/edits`、`/v1/images/variations`，代理负责把请求转发到 OpenAI，上游成功后把生成图片保存到本地，并生成缩略图和历史记录。

它解决两个问题：

- 在服务端统一管理 OpenAI API Key、调用记录、输入参考图和输出图片。
- 在需要人工审核时，生成完成后先进入待审批状态，管理员通过后客户端才拿到原始 OpenAI 响应。

## 适用场景

- 图片生成能力需要接入内部系统，但不能把 OpenAI API Key 下发到客户端。
- 需要保存所有生成结果和缩略图，方便后续审计或人工复核。
- 需要对高风险图片请求做管理员审批。
- 需要限制谁能使用图片代理，并限制调用频率和并发数。

不适合的场景：

- 需要高并发、多租户计费、复杂权限和审计报表的完整 API Gateway。
- 需要长期保存海量历史记录但不接数据库。
- 需要真正流式转发 SSE 到客户端。当前实现会先读取完整上游响应，再保存和返回。

## 功能概览

- 兼容 OpenAI 图片相关端点：
  - `POST /v1/images/generations`
  - `POST /v1/images/edits`
  - `POST /v1/images/variations`
- JSON 请求原样转发。
- multipart 请求保留字段名、重复字段、文件名和 MIME 类型后重建 `FormData` 转发。
- 保存上传的参考图、mask、结构图或其他输入文件。
- 保存 OpenAI 返回的 `b64_json` 图片。
- 支持下载 OpenAI 返回的图片 URL 并保存。
- 支持从 OpenAI 图片 SSE 完成事件中提取最终图片。
- 使用 `sharp` 生成 WebP 缩略图。
- 支持审批关闭时直接返回上游原始响应。
- 支持审批开启时等待管理员通过或拒绝。
- 支持等待超时后返回 `202`，客户端轮询请求状态。
- 支持客户端 API key、限流和并发限制。
- 支持 JSON body、multipart 文件/字段数量、远端图片下载大小和下载超时限制。
- 支持管理员历史、待审批、汇总和资产访问接口。
- 支持环境变量和 JSON 配置文件。

## 目录结构

```text
image/
  src/
    accessControl.js    # 客户端 API key、限流、并发控制
    admin.js            # 管理员接口
    app.js              # Express 应用装配
    assets.js           # 输入/输出图片保存、缩略图、SSE 解析
    config.js           # 配置加载
    openaiProxy.js      # 图片请求代理、审批等待、上游响应返回
    requestParser.js    # JSON/multipart 请求解析
    server.js           # 入口文件
    store.js            # JSON 文件历史存储
    waiters.js          # 审批等待器
  test/
    proxy.test.js       # Node 内置测试
  .env.example
  package.json
  README.md
```

默认运行后会生成：

```text
storage/
  data/history.json     # 历史记录
  generated/            # 生成图片
  inputs/               # 上传的输入图片或 data URL 图片
  thumbnails/           # WebP 缩略图
```

## 请求流程

审批关闭时：

```text
Client
  |
  | POST /v1/images/generations
  v
Image Proxy
  |
  | 转发到 OpenAI
  v
OpenAI
  |
  | 返回图片响应
  v
Image Proxy 保存图片和缩略图
  |
  | 返回 OpenAI 原始响应
  v
Client
```

审批开启时：

```text
Client 发起图片请求
  |
Image Proxy 调 OpenAI 并保存结果
  |
状态变为 pending_review
  |
管理员 approve 或 reject
  |
通过: 原始请求返回 OpenAI 响应
拒绝: 原始请求返回 403
超时: 原始请求返回 202，客户端轮询状态
```

## 安装和运行

要求：

- Node.js 20 或更高版本。

安装依赖：

```bash
npm install
```

准备配置：

```bash
cp .env.example .env
```

至少设置：

```bash
OPENAI_API_KEY=sk-...
IMAGE_PROXY_ADMIN_TOKEN=admin-secret
```

启动：

```bash
npm start
```

默认地址：

```text
http://localhost:3000
```

修改端口：

```bash
PORT=3001 npm start
```

Windows PowerShell：

```powershell
$env:OPENAI_API_KEY="sk-..."
$env:IMAGE_PROXY_REQUIRE_APPROVAL="true"
$env:IMAGE_PROXY_ADMIN_TOKEN="admin-secret"
npm start
```

## 客户端调用

### JSON 图片生成

```bash
curl http://127.0.0.1:3000/v1/images/generations \
  -H 'content-type: application/json' \
  -d '{
    "model": "gpt-image-1",
    "prompt": "A clean operations dashboard on a large display",
    "size": "1024x1024"
  }'
```

如果启用了 `IMAGE_PROXY_CLIENT_API_KEYS`：

```bash
curl http://127.0.0.1:3000/v1/images/generations \
  -H 'authorization: Bearer client-key-1' \
  -H 'content-type: application/json' \
  -d '{
    "model": "gpt-image-1",
    "prompt": "A clean operations dashboard on a large display"
  }'
```

### multipart 图片编辑

```bash
curl http://127.0.0.1:3000/v1/images/edits \
  -H 'authorization: Bearer client-key-1' \
  -F model=gpt-image-1 \
  -F prompt='Replace the background with a bright studio' \
  -F image=@reference.png \
  -F mask=@mask.png
```

### 查询审批状态

当审批开启且等待超过 `IMAGE_PROXY_APPROVAL_HOLD_MS`，原请求会返回：

```json
{
  "id": "request-id",
  "status": "pending_review",
  "message": "Image generation is complete and waiting for administrator approval.",
  "status_url": "/v1/images/requests/request-id"
}
```

客户端可轮询：

```bash
curl http://127.0.0.1:3000/v1/images/requests/request-id \
  -H 'authorization: Bearer client-key-1'
```

返回状态：

| HTTP 状态 | 业务状态 | 含义 |
| --- | --- | --- |
| `200` | `approved` 或 `completed` | 已完成，可读取 `result`。 |
| `202` | `pending_review` | 仍在等待审批。 |
| `403` | `rejected` | 管理员拒绝。 |
| `404` | 无 | 请求 ID 不存在。 |

## 兼容性说明

代理层不会白名单校验 OpenAI 图片参数，目的是尽量兼容未来新增参数。

转发规则：

- JSON 请求：读取原始 body，按原始 JSON 转发。
- multipart 请求：使用 `busboy` 解析后重建 `FormData` 转发。
- `OPENAI_API_KEY` 存在时，代理使用服务端 key 调 OpenAI。
- `OPENAI_API_KEY` 为空时，代理透传客户端 `Authorization` 头。
- `OpenAI-Organization`、`OpenAI-Project`、`OpenAI-Beta` 会继续传给上游。

## 客户端访问控制

默认不要求客户端额外认证，以便保持 OpenAI API 兼容调用。

部署到共享网络或公网前，建议开启：

```bash
IMAGE_PROXY_CLIENT_API_KEYS=client-key-1,client-key-2
IMAGE_PROXY_RATE_LIMIT_PER_MINUTE=30
IMAGE_PROXY_MAX_CONCURRENT_REQUESTS=3
IMAGE_PROXY_UPSTREAM_TIMEOUT_MS=600000
npm start
```

启用 `IMAGE_PROXY_CLIENT_API_KEYS` 后，客户端必须发送：

```text
Authorization: Bearer client-key-1
```

或：

```text
x-api-key: client-key-1
```

说明：

- `IMAGE_PROXY_CLIENT_API_KEYS` 是代理入口 key，用于控制谁能调用代理。
- `OPENAI_API_KEY` 是上游 OpenAI key，用于代理调用 OpenAI。
- 两者不是同一个概念。
- 如果没有配置 `OPENAI_API_KEY`，代理会把客户端 `Authorization` 头透传给 OpenAI。此时不要同时启用会占用 `Authorization` 的客户端 key，建议使用 `x-api-key` 或直接配置服务端 `OPENAI_API_KEY`。

## 审批模式

开启审批：

```bash
IMAGE_PROXY_REQUIRE_APPROVAL=true
IMAGE_PROXY_APPROVAL_HOLD_MS=300000
IMAGE_PROXY_ADMIN_TOKEN=admin-secret
npm start
```

行为：

- 请求进入 OpenAI 之前不会等待审批。
- OpenAI 返回成功后，代理会保存生成图和缩略图。
- 保存完成后状态变为 `pending_review`。
- 原始 HTTP 请求会等待管理员审批。
- 管理员通过后，原始请求返回 OpenAI 原始响应。
- 管理员拒绝后，原始请求返回 `403`。
- 超过 `IMAGE_PROXY_APPROVAL_HOLD_MS` 后，原始请求返回 `202`，客户端可继续轮询。

状态流转：

```text
generating
  |
  | OpenAI 成功
  v
completed               # 审批关闭

generating
  |
  | OpenAI 成功
  v
pending_review          # 审批开启
  |        |
  |        +-- reject --> rejected
  |
  +-- approve --> approved

generating
  |
  | OpenAI 或代理处理失败
  v
failed
```

## 管理员接口

管理员接口支持：

```text
Authorization: Bearer <IMAGE_PROXY_ADMIN_TOKEN>
```

或：

```text
x-admin-token: <IMAGE_PROXY_ADMIN_TOKEN>
```

如果没有设置 `IMAGE_PROXY_ADMIN_TOKEN`，管理员接口不受保护。只建议本地开发这样做。

### 健康检查

```http
GET /healthz
```

返回：

```json
{
  "ok": true,
  "records": 12,
  "approvalRequired": true,
  "clientAuthRequired": true
}
```

### 待审批列表

```http
GET /admin/pending
```

返回：

```json
{
  "data": [
    {
      "id": "request-id",
      "status": "pending_review",
      "prompt": "..."
    }
  ]
}
```

### 历史列表

```http
GET /admin/history
```

支持过滤：

```http
GET /admin/history?status=completed&limit=20
```

### 单条历史

```http
GET /admin/history/:id
```

### 汇总

```http
GET /admin/summary
```

返回：

```json
{
  "records": 12,
  "byStatus": {
    "completed": 8,
    "pending_review": 2,
    "rejected": 1,
    "failed": 1
  },
  "pendingReview": 2,
  "generatedImages": 10,
  "inputFiles": 4,
  "generatedBytes": 1024000,
  "inputBytes": 512000
}
```

### 审批通过

```http
POST /admin/approvals/:id/approve
```

可选请求头：

```text
x-admin-user: alice
```

### 审批拒绝

```http
POST /admin/approvals/:id/reject
Content-Type: application/json

{
  "reason": "policy review failed"
}
```

### 图片资产

```http
GET /admin/assets/:id/:kind/:filename
```

`kind` 支持：

| kind | 说明 |
| --- | --- |
| `inputs` | 上传的输入文件、参考图、mask 或 data URL 图片。 |
| `generated` | 生成图片。 |
| `thumbnails` | WebP 缩略图。 |

历史接口里会返回这些资产 URL。

## 配置

配置来源：

1. 环境变量。
2. `IMAGE_PROXY_CONFIG_FILE` 指定的 JSON 文件。
3. 当前项目目录下的 `config.json`。
4. 默认值。

环境变量优先级最高。

### 环境变量

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | HTTP 监听端口。 |
| `OPENAI_API_KEY` | 空 | 服务端 OpenAI API Key。为空时透传客户端 `Authorization`。 |
| `OPENAI_BASE_URL` | `https://api.openai.com` | OpenAI API Base URL，可用于兼容网关。 |
| `OPENAI_ORG_ID` | 空 | 上游 `OpenAI-Organization`。 |
| `OPENAI_PROJECT_ID` | 空 | 上游 `OpenAI-Project`。 |
| `IMAGE_PROXY_REQUIRE_APPROVAL` | `false` | 是否开启审批。 |
| `IMAGE_PROXY_APPROVAL_HOLD_MS` | `300000` | 原始请求等待审批的最长时间。 |
| `IMAGE_PROXY_UPSTREAM_TIMEOUT_MS` | `600000` | 调 OpenAI 的超时时间。 |
| `IMAGE_PROXY_MAX_JSON_BODY_BYTES` | `1073741824` | JSON 请求体最大字节数。 |
| `IMAGE_PROXY_MAX_MULTIPART_FILE_BYTES` | `52428800` | 单个 multipart 文件最大字节数。 |
| `IMAGE_PROXY_MAX_MULTIPART_FILES` | `8` | 单个 multipart 请求最多文件数。 |
| `IMAGE_PROXY_MAX_MULTIPART_FIELDS` | `100` | 单个 multipart 请求最多普通字段数。 |
| `IMAGE_PROXY_GENERATED_DOWNLOAD_TIMEOUT_MS` | `60000` | 下载上游返回图片 URL 的超时时间。 |
| `IMAGE_PROXY_GENERATED_DOWNLOAD_MAX_BYTES` | `52428800` | 下载上游返回图片 URL 的最大字节数，也用于限制 `b64_json` 解码后的图片大小。 |
| `IMAGE_PROXY_ALLOW_PRIVATE_GENERATED_URLS` | `false` | 是否允许下载上游返回的本地/内网图片 URL。默认关闭，避免 SSRF。 |
| `IMAGE_PROXY_CLIENT_API_KEYS` | 空 | 代理入口 key，逗号分隔。为空时不校验客户端 key。 |
| `IMAGE_PROXY_RATE_LIMIT_PER_MINUTE` | `0` | 每个客户端每分钟限制。`0` 表示不限制。 |
| `IMAGE_PROXY_MAX_CONCURRENT_REQUESTS` | `0` | 每个客户端最大并发。`0` 表示不限制。 |
| `IMAGE_PROXY_STORAGE_DIR` | `./storage` | 存储根目录。 |
| `IMAGE_PROXY_GENERATED_DIR` | `./storage/generated` | 生成图片目录。 |
| `IMAGE_PROXY_THUMBNAIL_DIR` | `./storage/thumbnails` | 缩略图目录。 |
| `IMAGE_PROXY_INPUT_DIR` | `./storage/inputs` | 输入文件目录。 |
| `IMAGE_PROXY_DATA_FILE` | `./storage/data/history.json` | 历史记录 JSON 文件。 |
| `IMAGE_PROXY_THUMBNAIL_WIDTH` | `384` | 缩略图宽度。 |
| `IMAGE_PROXY_ADMIN_TOKEN` | 空 | 管理员接口 token。为空时管理员接口不受保护。 |

### JSON 配置文件

默认会读取项目目录下的 `config.json`。也可以指定路径：

```bash
IMAGE_PROXY_CONFIG_FILE=/data/image-proxy/config.json npm start
```

示例：

```json
{
  "port": 3000,
  "openaiApiKey": "sk-...",
  "openaiBaseUrl": "https://api.openai.com",
  "requireApproval": true,
  "approvalHoldMs": 300000,
  "upstreamTimeoutMs": 600000,
  "maxJsonBodyBytes": 1073741824,
  "maxMultipartFileBytes": 52428800,
  "maxMultipartFiles": 8,
  "maxMultipartFields": 100,
  "generatedImageDownloadTimeoutMs": 60000,
  "generatedImageDownloadMaxBytes": 52428800,
  "allowPrivateGeneratedImageUrls": false,
  "clientApiKeys": ["client-key-1", "client-key-2"],
  "clientRateLimitPerMinute": 30,
  "clientMaxConcurrentRequests": 3,
  "storageDir": "./storage",
  "thumbnailWidth": 384,
  "adminToken": "admin-secret"
}
```

## 历史记录格式

历史记录保存在：

```text
storage/data/history.json
```

每条记录包含：

- 请求 ID、端点、方法、状态、创建时间、更新时间。
- 请求元数据，包括 prompt、参数、输入文件。
- 上游状态码、content-type 和可解析 JSON 响应。
- 生成图片路径、URL、字节数、缩略图。
- 审批信息，包括 decision、reviewer、reason。
- 失败信息。

`JsonStore` 使用单文件 JSON 和写队列，适合轻量部署。高并发、大量历史或长期保留建议迁移到 SQLite、Postgres 或对象存储加数据库索引。

## 存储和备份

需要备份：

- `storage/data/history.json`
- `storage/generated/`
- `storage/inputs/`
- `storage/thumbnails/`

建议：

- 对 `storage/` 设置仅服务进程可读写。
- 定期归档历史图片。
- 对包含敏感输入图或提示词的环境设置保留周期。
- 不要把 `storage/` 提交到 Git。

## 安全说明

生产环境建议：

- 设置 `OPENAI_API_KEY`，不要依赖客户端透传上游 key。
- 设置 `IMAGE_PROXY_ADMIN_TOKEN`。
- 如果代理服务对多人开放，设置 `IMAGE_PROXY_CLIENT_API_KEYS`。
- 设置合理的 `IMAGE_PROXY_RATE_LIMIT_PER_MINUTE` 和 `IMAGE_PROXY_MAX_CONCURRENT_REQUESTS`。
- 保持 multipart 和远端图片下载限制，不要把大小上限设置到超过机器内存可承受范围。
- 把服务部署在 HTTPS 后面。
- 限制 `/admin/*` 只允许管理员网络或管理员用户访问。
- 对 `storage/` 做权限控制和备份。

注意：

- 代理会保存 prompt、请求参数、输入图片和输出图片。
- 管理员资产接口可以读取历史图片。
- 若不设置管理员 token，任何能访问服务的人都可以查看历史和审批请求。
- 当上游响应包含图片 URL 时，代理只允许下载 `http`/`https` URL，并默认阻止明显的本地、内网和云元数据地址。只有明确信任兼容上游时才设置 `IMAGE_PROXY_ALLOW_PRIVATE_GENERATED_URLS=true`。

## 测试

运行测试：

```bash
npm test
```

测试覆盖：

- JSON 图片生成代理。
- 输出图片和缩略图保存。
- 审批通过后释放原始响应。
- 审批等待超时后返回 `202`。
- 审批拒绝返回 `403`。
- multipart 参考图和结构图保存。
- SSE 完成事件图片保存。
- 客户端 API key 校验。
- 客户端限流。
- 管理员汇总接口。
- multipart 文件大小限制。
- 上游图片 URL 下载大小限制。

## 常见问题

### 返回 401

可能原因：

- `/v1/images/*` 开启了 `IMAGE_PROXY_CLIENT_API_KEYS`，但客户端没有发送正确 key。
- `/admin/*` 设置了 `IMAGE_PROXY_ADMIN_TOKEN`，但管理员请求没有带 token。

### 返回 202

表示图片已经生成并保存，但仍等待管理员审批。客户端应使用 `status_url` 轮询。

### 返回 403

通常表示管理员拒绝了该请求。

### 图片没有保存

检查：

- 上游是否返回了成功状态码。
- 响应里是否包含 `data[].b64_json` 或 `data[].url`。
- 进程是否有权限写入 `storage/`。
- `sharp` 是否安装成功。

### multipart 请求失败

确认客户端使用的是 `multipart/form-data`，不要手动写错 boundary。使用 `curl -F`、浏览器 `FormData` 或 SDK 通常最稳。

### 管理员接口开放

如果启动时看到：

```text
IMAGE_PROXY_ADMIN_TOKEN is not set; admin endpoints are unprotected.
```

说明管理员接口没有保护。生产环境必须设置 `IMAGE_PROXY_ADMIN_TOKEN`。

## 已知边界

- 当前不是高并发 API Gateway。
- 当前历史记录是单 JSON 文件，不适合无限增长。
- SSE 响应不是边接收边转发，而是完整读取后保存和返回。
- 当前没有内置 Web 管理页面，管理员需要直接调用 HTTP API 或自行接入前端。
