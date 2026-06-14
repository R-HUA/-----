# 第三方 API、MCP、LLM 网关与工具对比

[返回索引](./README.md) | [Codex 高级教程](./02-codex-advanced.md) | [Claude Code 高级教程](./03-claude-code-advanced.md) | [来源](./07-sources.md)

## 1. 集成方式总览

| 集成方式 | 作用 | Codex | Claude Code |
| --- | --- | --- | --- |
| MCP server | 把外部工具、资源、prompt 暴露给 agent | 支持 stdio、streamable HTTP、OAuth/Bearer、tool policy | 支持 HTTP、SSE、stdio、WebSocket、tool search、channels、MCP prompts |
| LLM gateway | 统一认证、审计、模型路由、成本控制 | `openai_base_url`、custom `model_providers`、Azure/OpenAI-compatible | `ANTHROPIC_BASE_URL`、LiteLLM、Anthropic Messages/Bedrock/Vertex gateway |
| Cloud provider | 通过云厂商调用模型 | Amazon Bedrock built-in provider | Amazon Bedrock、Google Vertex AI、Microsoft Foundry、Claude Platform on AWS |
| 本地模型 | 本地推理/低成本实验 | Ollama、LM Studio OSS mode | 主要通过 gateway 或自定义 provider 路由，官方重点在 Claude provider |
| Agent-as-tool | 把 Codex/Claude Code 作为另一个 agent 的工具 | `codex mcp-server` | `claude mcp serve` |
| 插件/skills | 打包可复用工作流和工具 | Codex plugins 包含 skills、apps、MCP、hooks | Claude plugins 包含 skills、agents、hooks、MCP |

## 2. 常用 MCP 工具

| 工具 | 主要用途 | 适合谁 | 注意事项 |
| --- | --- | --- | --- |
| Context7 | 获取最新开发文档 | Codex、Claude Code | 文档检索类，低风险，适合默认启用 |
| GitHub MCP | issue、PR、review、repo 操作 | 两者 | 写操作必须加审批和最小权限 token |
| Figma MCP | 读取设计稿、组件、标注 | 两者 | 注意设计文件访问权限和 token |
| Playwright MCP | 浏览器自动化、页面检查 | 两者 | 可读取页面内容，注意 prompt injection |
| Chrome DevTools MCP | Chrome 调试、console、network、截图 | Codex 官方列为常见 MCP；Claude 可通过 MCP/Chrome 功能 | 与真实浏览器/本机状态有关，权限要收紧 |
| Sentry MCP | 错误日志、trace、release 问题 | 两者 | 日志可能含敏感信息，建议只读 |
| PostgreSQL/DB MCP | 查询数据库 | 两者 | 默认只读，配合 hook 阻止写 SQL |
| Notion/Linear/Jira MCP | 需求、任务、知识库 | 两者 | 明确 agent 可创建/修改哪些对象 |

## 3. Codex MCP 配置

CLI:

```bash
codex mcp add context7 -- npx -y @upstash/context7-mcp
```

TOML:

```toml
[mcp_servers.github]
url = "https://example.com/github/mcp"
bearer_token_env_var = "GITHUB_MCP_TOKEN"
enabled_tools = ["search_issues", "get_pull_request"]
default_tools_approval_mode = "prompt"
tool_timeout_sec = 60
```

策略:

- 只读工具可 `auto`。
- 写 PR/comment/delete/deploy 类工具用 `prompt` 或 `approve`。
- 项目级 `.codex/config.toml` 仅在 trusted project 加载。
- plugin-provided MCP 可通过 plugin config 控制启用和 tool policy。

## 4. Claude Code MCP 配置

HTTP:

```bash
claude mcp add --transport http notion https://mcp.notion.com/mcp
```

stdio:

```bash
claude mcp add --env AIRTABLE_API_KEY=YOUR_KEY --transport stdio airtable \
  -- npx -y airtable-mcp-server
```

`.mcp.json`:

```json
{
  "mcpServers": {
    "core-tools": {
      "type": "http",
      "url": "https://mcp.example.com/mcp",
      "alwaysLoad": true
    }
  }
}
```

高级:

- `headersHelper`: 动态生成认证 header。
- `MAX_MCP_OUTPUT_TOKENS`: 调整 MCP 输出上限。
- `ENABLE_TOOL_SEARCH`: 控制 MCP tool schema 是否延迟加载。
- `alwaysLoad`: 某 server/tool 每次启动都加载。
- MCP prompts 可变成 `/mcp__server__prompt` slash command。
- MCP channel 可把外部 webhook、CI、聊天消息推入 session。

## 5. LLM gateway 对比

### Codex

Codex 的 provider 体系偏 OpenAI-compatible:

```toml
model_provider = "proxy"
model = "gpt-5.4"

[model_providers.proxy]
name = "OpenAI-compatible proxy"
base_url = "https://proxy.example.com/v1"
env_key = "OPENAI_API_KEY"
wire_api = "responses"
```

适合:

- 企业内部 OpenAI proxy。
- Azure OpenAI-compatible endpoint。
- 数据驻留 endpoint。
- 本地 Ollama/LM Studio。
- Bedrock Mantle 上的 OpenAI models。

注意:

- 内置 provider ID `openai`、`ollama`、`lmstudio` 不能被自定义覆盖。
- 只改内置 OpenAI base URL 时用 `openai_base_url`，不要创建 `[model_providers.openai]`。
- Desktop/IDE 不一定继承 shell env，必要时写 `~/.codex/.env`。

### Claude Code

Claude Code 的 gateway 要求更明确:

- Anthropic Messages: `/v1/messages`、`/v1/messages/count_tokens`
- Bedrock InvokeModel: `/invoke`、`/invoke-with-response-stream`
- Vertex rawPredict: `:rawPredict`、`:streamRawPredict`、`/count-tokens:rawPredict`

必须正确转发:

- `anthropic-beta`
- `anthropic-version`
- Claude Code session/agent attribution headers

LiteLLM 示例:

```bash
export ANTHROPIC_AUTH_TOKEN=sk-litellm-static-key
export ANTHROPIC_BASE_URL=https://litellm-server:4000
```

动态 key:

```json
{
  "apiKeyHelper": "~/bin/get-litellm-key.sh"
}
```

注意:

- LiteLLM 是第三方代理；官方文档特别警告过 PyPI 版本 `1.82.7` 和 `1.82.8` 曾被植入 credential-stealing malware，不能安装这些版本。
- 非 first-party `ANTHROPIC_BASE_URL` 可能影响 tool search；必要时显式设置 `ENABLE_TOOL_SEARCH`。

## 6. Cloud provider 对比

| Provider | Codex | Claude Code |
| --- | --- | --- |
| Amazon Bedrock | built-in `amazon-bedrock` provider，支持 OpenAI models on Bedrock | 官方支持 Bedrock，含 setup、IAM、troubleshooting |
| Google Vertex AI | 通过 OpenAI-compatible/custom provider 路由的可行性取决于 endpoint | 官方支持 Vertex AI |
| Microsoft Foundry | 当前 Codex 官方重点不在 Foundry | 官方支持 Foundry |
| Azure OpenAI | custom `model_providers.azure` | 可通过 gateway/enterprise deployment 路由，具体看组织配置 |
| 本地 Ollama/LM Studio | `--oss` / `oss_provider` | 通常不作为官方一线 provider，更多通过 gateway |

## 7. Agent-as-tool

### Codex 作为 MCP server

```bash
codex mcp-server
```

外部 orchestrator 调用 `codex` 开新 thread，再用 `codex-reply` 继续同一 thread。

适合:

- OpenAI Agents SDK 编排多 agent。
- 自建工作流把 Codex 当“代码执行/审查 worker”。
- 在另一个 AI 客户端里调用 Codex。

### Claude Code 作为 MCP server

```bash
claude mcp serve
```

可放进 Claude Desktop MCP config:

```json
{
  "mcpServers": {
    "claude-code": {
      "type": "stdio",
      "command": "claude",
      "args": ["mcp", "serve"],
      "env": {}
    }
  }
}
```

注意: 这个 server 暴露 Claude Code 的工具能力，调用方需要自己实现用户确认和权限控制。

## 8. 安全清单

1. MCP server 来源必须可审计，尤其是 npm/npx 直接运行的 stdio server。
2. 写权限工具单独 allow，不要把 server 全部工具设为自动批准。
3. 数据库、生产日志、Sentry、CRM 类工具默认只读。
4. hooks 脚本使用绝对路径，输入 JSON 必须校验和转义。
5. LLM gateway 不只看能否返回回答，还要检查 beta headers、streaming、tool use、count tokens、tool search 是否兼容。
6. Desktop/computer use/Chrome 自动化会接触真实本机或浏览器状态，敏感任务要用 sandbox、VM 或只读模式。

