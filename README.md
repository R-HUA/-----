# Misc Projects

当前目录包含两个独立的 Node.js 项目：

| 目录 | 项目 | 作用 |
| --- | --- | --- |
| `dashboard/` | 服务工作台 | 用后端反向代理访问内网或受限 Web 服务，并在统一前端里以多标签 iframe 展示。 |
| `image/` | OpenAI 图片审批代理 | 兼容 OpenAI Images API，转发图片生成/编辑/变体请求，保存输入输出图片，并可选启用管理员审批。 |

这两个项目都已从最初 demo 形态补强为更接近可试部署的轻量服务：

- `dashboard` 增加了访问令牌、目标主机 allowlist、云元数据地址默认阻断、代理超时、服务健康检查和前端状态显示。
- `image` 增加了客户端 API key、限流、并发限制、上游超时、健康检查和管理员汇总接口。

## 快速启动

分别进入项目目录运行。

```bash
cd dashboard
npm install
npm start
```

```bash
cd image
npm install
cp .env.example .env
npm start
```

默认两个项目都监听 `http://localhost:3000`。如果同时运行，需要给其中一个设置不同端口：

```bash
PORT=3001 npm start
```

## 文档入口

- [dashboard/README.md](dashboard/README.md)：服务工作台详细说明。
- [image/README.md](image/README.md)：OpenAI 图片审批代理详细说明。

## 验证命令

`dashboard` 当前没有完整自动化测试，至少执行语法检查和一次本地 API 探测：

```bash
cd dashboard
node --check server.js
node --check public/app.js
```

`image` 有 Node 内置测试：

```bash
cd image
npm test
```

当前已验证：

- `image`: `npm test` 通过，8 个测试全部通过。
- `dashboard`: `server.js` 和 `public/app.js` 语法检查通过，并实测了认证、服务列表、健康检查和 allowlist 拒绝行为。

## 部署前检查

部署到共享网络或公网前，建议至少完成这些配置：

- `dashboard`: 设置 `DASHBOARD_ADMIN_TOKEN` 和 `DASHBOARD_ALLOWED_HOSTS`。
- `image`: 设置 `OPENAI_API_KEY`、`IMAGE_PROXY_ADMIN_TOKEN`，按需设置 `IMAGE_PROXY_CLIENT_API_KEYS`。
- 把服务放在反向代理之后时，统一使用 HTTPS。
- 不要把未设置管理员 token 的管理接口暴露给非可信网络。
- 对 `image/storage/` 做备份、权限控制和保留周期管理。
- 对 `dashboard/config/services.json` 做变更审计或访问控制。

## 设计参考方向

代码没有直接复制第三方项目，但增强方向参考了 GitHub 上成熟项目的常见能力：

- 服务工作台/状态看板类项目通常具备服务配置、状态探测、认证和后端访问封装。
- OpenAI 兼容代理/API Gateway 类项目通常具备客户端 key、限流、并发控制、管理接口和请求审计。

这两个项目仍保持轻量实现，不追求替代完整平台。需要多人权限、审计报表、高并发或长期数据保留时，应进一步接入数据库、用户体系和集中日志。
