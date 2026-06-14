# Codex 与 Claude Code 高级使用文档

更新时间: 2026-06-09  
范围: 只覆盖桌面版、CLI 版和可编程/第三方集成的高级用法；不包含基础安装、登录、普通对话。

## 阅读路线

1. [总览与选型矩阵](./01-overview-and-selection.md)
2. [OpenAI Codex 高级教程](./02-codex-advanced.md)
3. [Claude Code 高级教程](./03-claude-code-advanced.md)
4. [Slash 命令、workflow 与并行代理对照](./04-commands-workflows-agents.md)
5. [第三方 API、MCP、LLM 网关与工具对比](./05-third-party-api-mcp-gateways.md)
6. [社区讨论归纳: linux.do、V2EX、Reddit 等](./06-community-notes.md)
7. [资料来源与核验记录](./07-sources.md)

## 快速结论

Codex 更适合把本地 repo、审查、自动化、MCP、skills/plugins、hooks、Goal mode 和 OpenAI 生态串起来。它的 CLI、IDE、桌面 app 共享配置，并且官方手册对 `config.toml`、MCP、provider、hooks、subagents、plugins 的边界写得很细。

Claude Code 的 CLI 和 Desktop 在 2026 年新增了更强的并行与后台能力: `/batch`、`/workflows`、`ultracode`、dynamic workflows、agent view、Desktop 多会话和视觉 diff。它还提供更丰富的 hooks 事件、HTTP/prompt/agent hook、MCP channel、tool search、LLM gateway 文档。

如果目标是“把 coding agent 当作可扩展开发平台”，优先看 [第三方 API、MCP、LLM 网关与工具对比](./05-third-party-api-mcp-gateways.md)。如果目标是“日常高效用法”，优先看 [Slash 命令、workflow 与并行代理对照](./04-commands-workflows-agents.md)。

