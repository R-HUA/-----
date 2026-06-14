# 总览与选型矩阵

[返回索引](./README.md) | [Codex](./02-codex-advanced.md) | [Claude Code](./03-claude-code-advanced.md) | [第三方集成](./05-third-party-api-mcp-gateways.md)

## 结论先行

| 场景 | 更适合 Codex | 更适合 Claude Code |
| --- | --- | --- |
| 本地 repo 中持续修改、运行命令、审查 diff | 强。CLI/IDE/app 共用配置，`/review`、Goal mode、subagents、hooks、MCP 都在同一配置体系下 | 强。CLI 和 Desktop 都能完成，Desktop 的 diff/preview/terminal pane 更适合可视化审阅 |
| 需要桌面可视化、多会话、自动 worktree、预览网页、PR 状态 | Codex app 有线程、review pane、browser/computer use、automations，但更偏 OpenAI/Codex 体系 | Claude Desktop Code tab 很强: 多 session、pane 布局、preview、diff 评论、CI autofix、Desktop 与 CLI 跳转 |
| 大规模并行研究或迁移 | Codex subagents 适合显式并行分工；Goal mode 适合长目标推进 | Claude dynamic workflows 更像脚本化 fan-out，可支持几十到上百 agent 的研究预览能力 |
| 可复用工作流 | Codex skills 是工作流作者格式，plugins 是分发格式 | Claude skills、plugins、subagents、workflows 都可作为可复用单元，命令菜单更密集 |
| 生命周期控制 | Codex hooks 支持核心事件，信任审查偏保守 | Claude hooks 事件更多，支持 command/http/MCP/prompt/agent hook，适合企业自动化 |
| 第三方 API/网关 | `openai_base_url`、custom `model_providers`、Azure/OpenAI-compatible、Ollama/LM Studio、Amazon Bedrock、MCP | Bedrock、Vertex、Foundry、Anthropic Messages 网关、LiteLLM、MCP、channels、tool search |
| 作为别的 agent 的工具 | `codex mcp-server` 暴露 `codex` 和 `codex-reply` | `claude mcp serve` 暴露 Claude Code 工具，也可从 Claude Desktop 导入 MCP |

## 不要混淆的概念

| 概念 | Codex 中的含义 | Claude Code 中的含义 |
| --- | --- | --- |
| Slash command | CLI/app/IDE 中直接控制会话、权限、模型、review、MCP、skills、goal 的命令 | CLI/Desktop/SDK 中控制会话、模型、权限、workflow、subagents、review、hooks、MCP 的命令 |
| Skill | 可复用任务说明，支持 progressive disclosure，可本地/仓库/系统分层 | 可复用能力，可生成命令，也可通过插件分发 |
| Plugin | Codex 的安装分发单元，可包含 skills、apps、MCP、hooks 等 | Claude Code 的扩展分发单元，可包含 skills、agents、hooks、MCP servers 等 |
| Subagent | 显式要求后由 Codex 生成并行 agent，CLI 可用 `/agent` 查看 | 内置 Explore/Plan/general-purpose，也可自定义；可前台、后台、fork、worktree 隔离 |
| Workflow | Codex 侧更接近 Goal mode、subagents、skills、noninteractive/SDK 编排 | 明确的 dynamic workflow: Claude 写 JS 脚本，runtime 执行，`/workflows` 管理 |
| MCP | 连接外部工具/上下文；Codex 可作为 MCP server | 连接外部工具/上下文；支持 HTTP/SSE/stdio/ws、tool search、channels、MCP prompts |

## 推荐组合

### 个人高频开发

- Codex: `AGENTS.md` + `/plan` + `/review` + `/goal` + Context7/Playwright/GitHub MCP。
- Claude Code: `CLAUDE.md` + `/plan` + `/code-review --fix` + `/btw` + `/fork` + Desktop diff/preview。

### 团队可复用工作流

- Codex: 把流程写成 skill，再封装成 plugin；把外部系统放进 MCP；用 hooks 做策略检查。
- Claude Code: 把专门角色写成 `.claude/agents/`；把常用流程做成 skill/plugin；把大规模 fan-out 做成 workflow。

### CI/CD 与无交互自动化

- Codex: `codex exec --json`、`--output-schema`、GitHub Action、`codex mcp-server` + Agents SDK。
- Claude Code: `claude -p`、Agent SDK、GitHub Actions/GitLab CI、routines/scheduled tasks、LLM gateway。

## 使用原则

1. 先把“持久规则”写进 `AGENTS.md` 或 `CLAUDE.md`，不要每次重复粘贴。
2. 只在任务足够大时启用 subagents/workflows。并行会显著增加 token、时间和冲突管理成本。
3. MCP 工具要按信任边界分层: 只读工具优先，写操作加审批或 hook。
4. 桌面版适合可视化审阅和多任务管理；CLI 适合脚本、自动化、SSH、可重复命令。
5. 第三方 LLM 网关要先确认协议兼容和 header/beta 转发，否则高级工具可能降级。

