# OpenAI Codex 高级教程

[返回索引](./README.md) | [命令/workflow 对照](./04-commands-workflows-agents.md) | [第三方集成](./05-third-party-api-mcp-gateways.md) | [来源](./07-sources.md)

## 1. 桌面 app 与 CLI 的定位

Codex 当前主要有 CLI、IDE extension、Codex app、web/cloud 等表面。高级使用时不要把它们当成互斥产品:

- CLI: 最适合本地 repo、shell、脚本化、MCP、`codex exec`、`codex mcp-server`。
- Codex app: 适合线程管理、计划、Goal mode、review pane、plugins、deep links、automations、browser/computer use。
- IDE extension: 适合把编辑器打开文件、选区、diff 和 cloud delegation 带入会话。
- Cloud/web: 适合把较大任务 offload 到托管环境，并从 IDE/CLI/app 跟进。

Codex 的共享核心是配置和本地状态: `~/.codex/config.toml`、`AGENTS.md`、skills、plugins、MCP、hooks、sessions。

## 2. Codex app 的高级命令

Codex app composer 中输入 `/` 可以看到可用 slash commands。官方手册列出的 app 命令包括:

| 命令 | 用途 |
| --- | --- |
| `/plan` | 进入多步骤计划模式，先整理方案再执行 |
| `/goal` | 设置持久目标，Codex 会持续推进到完成、暂停或需要输入 |
| `/review` | 进入代码审查模式，审查未提交变更或相对 base branch 的 diff |
| `/mcp` | 查看 MCP server 状态 |
| `/status` | 查看 thread ID、context、rate limit 等 |
| `/feedback` | 提交反馈，可附带日志 |

### Goal mode 用法

适合长任务、整理文档、大范围迁移。推荐流程:

```text
/plan 把这个 monorepo 从 Jest 迁移到 Vitest，先给出分阶段计划和风险点
```

计划认可后:

```text
/goal 按刚才计划完成 Jest 到 Vitest 迁移，保持现有测试语义，所有包测试通过后停止
```

使用要点:

- 目标要有明确完成条件。
- 长指令放到文件里，目标中引用文件路径。
- 过程中用普通消息继续修正方向，不要反复重设目标。

## 3. Codex CLI slash commands

Codex CLI 中 `/` 是控制面板。高频高级命令:

| 命令 | 场景 |
| --- | --- |
| `/permissions` | 在 Auto、Read Only、Full Access 等权限模式间切换 |
| `/model` | 切换模型和 reasoning effort |
| `/plan` | 先计划，暂不执行 |
| `/goal` | 设置、暂停、恢复、清除持久目标 |
| `/review` | 对 working tree、commit、base branch 做审查 |
| `/diff` | 查看 Git diff 和未跟踪文件 |
| `/mcp` | 查看 MCP 工具和服务器 |
| `/skills` | 浏览并显式使用 skills |
| `/plugins` | 浏览、安装、启用/禁用 plugins |
| `/hooks` | 查看和信任 lifecycle hooks |
| `/agent` | 查看/切换 subagent thread |
| `/fork` | 分叉当前 conversation 探索新路线 |
| `/side` 或 `/btw` | 临时侧聊，不污染主线程 |
| `/compact` | 总结当前上下文以释放 token |
| `/status` | 查看模型、权限、sandbox、context 和 token |
| `/debug-config` | 诊断配置层和 requirements |

### 推荐日常组合

```text
/plan 先检查这个支付模块，列出可能影响认证、幂等和退款的修改点
```

```text
/permissions
```

选择较保守权限后:

```text
按计划实现第一阶段，只修改 payment/ 下相关文件，完成后运行相关测试
```

完成后:

```text
/review
```

## 4. AGENTS.md: 持久项目规则

Codex 会从全局和项目目录加载 `AGENTS.md` / `AGENTS.override.md`，越靠近当前工作目录的规则优先。适合写:

- 构建、测试、lint 命令。
- repo 约定和目录路由。
- review 重点。
- 禁止事项和安全边界。

示例:

```md
# AGENTS.md

## Repository expectations

- 修改 TypeScript 后运行 `npm run typecheck`。
- API 层变更必须补充集成测试。
- 认证、权限、支付相关变更完成后运行 `/review`，重点查安全和竞态。
```

不要把一次性任务放进 `AGENTS.md`。一次性约束放在 prompt 或 `/goal` 里。

## 5. Skills 与 Plugins

Codex skills 是可复用 workflow 的作者格式。插件是分发格式，可包含 skills、apps、MCP server 配置、hooks、assets。

### 什么时候用 skill

- 你有固定步骤: 发布检查、PR 整理、迁移模板、审查标准。
- 流程需要引用文档或运行脚本。
- 希望 Codex 能根据 description 自动触发。

最小 skill:

```md
---
name: release-check
description: Run when preparing a release candidate or checking release readiness.
---

1. Read CHANGELOG.md and package metadata.
2. Verify version consistency.
3. Run the repo release validation command.
4. Report blockers first, then optional cleanup.
```

### 什么时候封装 plugin

- 要分享给团队或多个项目。
- skill 需要绑定 MCP、app connector 或 hooks。
- 需要在 Codex app 的 plugin directory 中安装/启用。

## 6. Subagents

Codex subagents 用来把大任务拆成并行、隔离的 agent thread。它不会自动 spawn，必须显式要求。

适合:

- 分模块读代码。
- 并行审查安全、性能、测试缺口。
- 分别分析日志、CI、用户报告。

示例:

```text
Review this branch with parallel subagents. Spawn one agent for security risks,
one for test gaps, and one for maintainability. Wait for all three, then
summarize findings by severity with file references.
```

管理:

- CLI 用 `/agent` 查看和切换 agent thread。
- 子代理继承当前 sandbox/approval。
- 并行写文件容易冲突，优先让 subagent 做 read-heavy 任务。

## 7. Hooks

Codex hooks 可在工具调用、权限请求、compaction、prompt submit、session start/stop 等生命周期中执行命令。用途:

- 阻止危险命令。
- 记录审计日志。
- 工具调用后自动运行校验。
- compaction 前后保存摘要。

示例: 阻止 Bash 中的危险命令。

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "/usr/bin/python3 \"$(git rev-parse --show-toplevel)/.codex/hooks/pre_tool_use_policy.py\"",
            "timeout": 30,
            "statusMessage": "Checking Bash command"
          }
        ]
      }
    ]
  }
}
```

注意:

- 非 managed hooks 需要 review/trust。
- 多个匹配 hook 会一起运行。
- 命令 hook 以当前 session `cwd` 运行。
- repo-local hooks 要用 git root 解析路径，避免从子目录启动时失效。

## 8. MCP

Codex 支持 stdio 和 streamable HTTP MCP server，CLI/IDE 共享 `config.toml`。

CLI 添加:

```bash
codex mcp add context7 -- npx -y @upstash/context7-mcp
```

TOML 配置:

```toml
[mcp_servers.context7]
command = "npx"
args = ["-y", "@upstash/context7-mcp"]
env_vars = ["LOCAL_TOKEN"]
```

HTTP/OAuth 示例:

```toml
[mcp_servers.figma]
url = "https://mcp.figma.com/mcp"
bearer_token_env_var = "FIGMA_OAUTH_TOKEN"
```

常见 MCP 工具见 [第三方 API、MCP、LLM 网关与工具对比](./05-third-party-api-mcp-gateways.md)。

## 9. 非交互与可编程接口

### `codex exec`

适合 CI、脚本、生成结构化报告:

```bash
codex exec --json "review the repository for flaky tests and summarize fixes" | jq
```

结构化输出:

```bash
codex exec "Extract project metadata" \
  --output-schema ./schema.json \
  -o ./project-metadata.json
```

### Codex 作为 MCP server

```bash
codex mcp-server
```

外部 MCP client 可调用:

- `codex`: 开始一个 Codex session。
- `codex-reply`: 用 thread ID 继续会话。

这适合用 OpenAI Agents SDK 或自建 orchestrator 让 Codex 成为“代码执行专家”。

## 10. 第三方模型与 API provider

Codex 支持:

- `openai_base_url`: 把内置 OpenAI provider 指向代理、router 或 data residency endpoint。
- `model_providers.*`: 自定义 OpenAI-compatible provider。
- Azure OpenAI-compatible endpoint。
- Ollama/LM Studio OSS mode。
- Amazon Bedrock built-in provider。

示例:

```toml
model = "gpt-5.4"
model_provider = "proxy"

[model_providers.proxy]
name = "OpenAI using LLM proxy"
base_url = "https://proxy.example.com/v1"
env_key = "OPENAI_API_KEY"
wire_api = "responses"
```

Bedrock:

```toml
model_provider = "amazon-bedrock"
model = "openai.gpt-5.5"

[model_providers.amazon-bedrock.aws]
profile = "default"
region = "us-east-2"
```

桌面 app 和 IDE extension 不一定继承 shell 环境变量。provider 凭据可放到 `~/.codex/.env` 后重启。

