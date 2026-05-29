# OpenAI Image Approval Proxy

一个 OpenAI Images API 中转后端。客户端继续调用兼容的 `/v1/images/generations`、`/v1/images/edits`、`/v1/images/variations`，服务端把 JSON 或 multipart 参数透传到 OpenAI，上游成功后把生成图保存到本地，并在单独目录生成缩略图。

审核关闭时，服务保存图片后直接返回 OpenAI 原始响应。审核开启时，生成完成并落盘后请求会进入 `pending_review`，原始 HTTP 请求会等待管理员审批；审批通过后才返回原始 OpenAI 响应，审批拒绝则返回 403。等待超过 `IMAGE_PROXY_APPROVAL_HOLD_MS` 后会返回 202，客户端可用 `GET /v1/images/requests/:id` 查询。

## Run

```bash
npm install
cp .env.example .env
npm start
```

Windows PowerShell 示例：

```powershell
$env:OPENAI_API_KEY="sk-..."
$env:IMAGE_PROXY_REQUIRE_APPROVAL="true"
$env:IMAGE_PROXY_ADMIN_TOKEN="admin-secret"
npm start
```

## Compatible Image Endpoints

- `POST /v1/images/generations`
- `POST /v1/images/edits`
- `POST /v1/images/variations`

请求参数不在代理层白名单校验。JSON 请求会用原始 body 转发；multipart 请求会保留字段名、重复字段、文件名和 MIME 类型重建 `FormData` 后转发，同时把上传的参考图、mask 或结构图保存到历史记录。

默认使用服务端 `OPENAI_API_KEY`。如果没有配置，代理会透传客户端请求里的 `Authorization` 头。`OpenAI-Organization`、`OpenAI-Project`、`OpenAI-Beta` 会继续传给上游。

## Admin Endpoints

管理员接口支持 `Authorization: Bearer <IMAGE_PROXY_ADMIN_TOKEN>` 或 `x-admin-token: <token>`。

- `GET /admin/pending`：待审批列表。
- `GET /admin/history`：所有生成历史，包含提示词、输入参考图、结构图/mask、生成图和缩略图 URL。
- `GET /admin/history/:id`：单条历史。
- `POST /admin/approvals/:id/approve`：审批通过，释放等待中的客户端请求。
- `POST /admin/approvals/:id/reject`：审批拒绝。
- `GET /admin/assets/:id/:kind/:filename`：查看历史记录里的图片资产。

## Config File

除环境变量外，也可以用 JSON 配置文件。默认会读取当前目录下的 `config.json`，或用 `IMAGE_PROXY_CONFIG_FILE` 指定路径。

```json
{
  "requireApproval": true,
  "approvalHoldMs": 300000,
  "storageDir": "./storage",
  "adminToken": "admin-secret"
}
```

环境变量优先级高于配置文件。
