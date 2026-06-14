# 资料来源与核验记录

[返回索引](./README.md)

## 官方资料

### OpenAI Codex

- Codex manual: https://developers.openai.com/codex/codex-manual.md
- Codex app commands: https://developers.openai.com/codex/app/commands
- Codex CLI slash commands: https://developers.openai.com/codex/cli/slash-commands
- Codex CLI features: https://developers.openai.com/codex/cli/features
- Codex MCP: https://developers.openai.com/codex/mcp
- Codex skills: https://developers.openai.com/codex/skills
- Codex plugins: https://developers.openai.com/codex/plugins
- Codex build plugins: https://developers.openai.com/codex/plugins/build
- Codex hooks: https://developers.openai.com/codex/hooks
- Codex subagents: https://developers.openai.com/codex/subagents
- Codex non-interactive mode: https://developers.openai.com/codex/noninteractive
- Codex with Agents SDK / MCP server: https://developers.openai.com/codex/guides/agents-sdk
- Codex with Amazon Bedrock: https://developers.openai.com/codex/amazon-bedrock

核验方式:

- 2026-06-09 通过 `openai-docs` 技能脚本拉取官方 Codex manual。
- 本地快照路径: `/tmp/openai-docs-cache/codex-manual.md`
- 关键章节: app commands、CLI slash commands、MCP、skills、plugins、hooks、subagents、noninteractive、Agents SDK、Amazon Bedrock。

### Anthropic Claude Code

- Docs index: https://code.claude.com/docs/llms.txt
- Overview: https://code.claude.com/docs/en/overview.md
- Commands: https://code.claude.com/docs/en/commands.md
- Desktop application: https://code.claude.com/docs/en/desktop.md
- Run agents in parallel: https://code.claude.com/docs/en/agents.md
- Dynamic workflows: https://code.claude.com/docs/en/workflows.md
- Subagents: https://code.claude.com/docs/en/sub-agents.md
- MCP: https://code.claude.com/docs/en/mcp.md
- Hooks reference: https://code.claude.com/docs/en/hooks.md
- LLM gateway: https://code.claude.com/docs/en/llm-gateway.md
- Settings: https://code.claude.com/docs/en/settings.md
- Skills: https://code.claude.com/docs/en/skills.md
- Plugins: https://code.claude.com/docs/en/plugins.md
- Agent SDK overview: https://code.claude.com/docs/en/agent-sdk/overview.md
- Agent SDK MCP: https://code.claude.com/docs/en/agent-sdk/mcp.md
- Agent SDK subagents: https://code.claude.com/docs/en/agent-sdk/subagents.md
- Routines: https://code.claude.com/docs/en/routines.md
- Scheduled tasks: https://code.claude.com/docs/en/scheduled-tasks.md
- Amazon Bedrock: https://code.claude.com/docs/en/amazon-bedrock.md
- Google Vertex AI: https://code.claude.com/docs/en/google-vertex-ai.md
- Microsoft Foundry: https://code.claude.com/docs/en/microsoft-foundry.md

核验方式:

- 2026-06-09 抓取 `llms.txt` 官方索引。
- 抓取并核对 `commands.md`、`workflows.md`、`hooks.md`、`mcp.md`、`desktop.md`、`agents.md`、`sub-agents.md`、`llm-gateway.md`。

## 社区资料入口

由于社区内容更新快、部分站点需要登录或会触发反爬，以下给出可复核入口、直接打开样本和建议关键词。2026-06-09 的抓取记录:

- linux.do 的 Discourse `search.json` 对本环境返回频率限制: `您执行此操作的次数过多，请稍后再试。`
- Reddit 搜索接口曾对本环境返回 network security block，要求登录或 developer token；本轮改用公开搜索结果与可打开页面补充样本。
- V2EX 页面可访问，但站内搜索 URL 在未登录/当前环境下没有稳定返回目标 query 的条目列表；本轮以可直接打开的节点和帖子为主。

因此本文档把社区内容处理为“讨论主题归纳 + 可复核讨论样本 + 搜索入口”。单帖只作为讨论方向证据，不作为客观结论。

### 2026-06-09 直接打开样本

#### V2EX

- Claude Code 节点: https://www.v2ex.com/go/claudecode
- Codex 对比 Claude Code: https://www.v2ex.com/t/1209638
- codex 的风评似乎在超过 Claude code？: https://www.v2ex.com/t/1207711
- OpenAI 为 Claude Code 做了一个调用 Codex 的插件: https://www.v2ex.com/t/1202376
- 锐评给 Claude Code 和 Codex 开发插件的体验: https://www.v2ex.com/t/1210423
- 你不知道的 Claude Code：架构、治理与工程实践: https://www.v2ex.com/t/1199971

访问备注:

- `https://www.v2ex.com/t/1163448` 在搜索结果中显示为 Claude Code workflow 相关帖，但当前环境直接打开会跳转到登录页，因此没有把该帖内容写入正文事实依据。

#### linux.do

- 写了个更简洁的 Claude Code MCP，方便 Codex/其他客户端调 Claude: https://linux.do/t/topic/1612022?tl=en
- Codex 增强版：对标 Claude Code 新增 Agent Teams、Hooks、anthropic api Agent、WebUI: https://linux.do/t/topic/1664790
- CCG v2.1.1：Claude Code 编排三 CLI 协作 | Codex + Gemini + Claude: https://linux.do/t/topic/1710380
- Claude Code - 精简你上下文(CLAUDE.md & MCP & output-style): https://linux.do/t/topic/1173647
- claude cli, codex cli, opencode cli 该怎么选: https://linux.do/t/topic/2124063
- Claude Code Hook奇思妙用，如何减少上下文的使用: https://linux.do/t/topic/882058
- 从 claude code hooks 到开发自己的插件增强 claude code: https://linux.do/t/topic/858908

#### Reddit

- Claude -> Codex -> Claude: https://www.reddit.com/r/ClaudeCode/comments/1svd04t/claude_codex_claude/
- Claude Code (~100 hours) vs. Codex (~20 hours): https://www.reddit.com/r/ClaudeCode/comments/1sk7e2k/claude_code_100_hours_vs_codex_20_hours/
- OpenAI Codex vs Claude Code in 2026 Spring: https://www.reddit.com/r/ChatGPTCoding/comments/1sie75z/openai_codex_vs_claude_code_in_2026_spring/
- Has anyone actually replaced Claude Code / Codex with local models on a MacBook Pro M5 Max 128GB?: https://www.reddit.com/r/ClaudeAI/comments/1typ9ld/has_anyone_actually_replaced_claude_code_codex/
- Using Codex CLI as a sub-agent in Claude Code: https://www.reddit.com/r/ClaudeAI/comments/1pf2r0o/using_codex_cli_as_a_subagent_in_claude_code/
- Codex or Claude Code?: https://www.reddit.com/r/ClaudeAI/comments/1m3v0wa/codex_or_claude_code/

#### Hacker News 与 GitHub

- OpenAI Codex CLI: Lightweight coding agent that runs in your terminal: https://news.ycombinator.com/item?id=43708025
- Claude Code: Now in Beta in Zed: https://news.ycombinator.com/item?id=45116688
- Claude × Codex Collab Two AI Coding Agents. One Orchestrator. Zero API Costs: https://news.ycombinator.com/item?id=47466997
- openai/codex issue: Full Claude Code Hook Parity: https://github.com/openai/codex/issues/21753
- openai/codex issue: Subagent Support: https://github.com/openai/codex/issues/2604?timeline_page=1
- openai-codex-claude-code-mcp: https://github.com/grll/openai-codex-claude-code-mcp
- codex-plugin-cc: https://github.com/jacksteamdev/codex-plugin-cc

### linux.do

搜索入口:

- https://linux.do/search?q=Claude%20Code%20MCP
- https://linux.do/search?q=Claude%20Code%20hooks
- https://linux.do/search?q=Codex%20Claude%20Code
- https://linux.do/search?q=Codex%20MCP

建议关键词:

- `Claude Code MCP`
- `Claude Code hooks`
- `Claude Code workflow`
- `Codex Claude Code`
- `OpenRouter`、`LiteLLM`、`one-api`

### V2EX

搜索入口:

- https://www.v2ex.com/search?q=Claude%20Code%20MCP
- https://www.v2ex.com/search?q=Claude%20Code%20hooks
- https://www.v2ex.com/search?q=Codex%20Claude%20Code
- https://www.v2ex.com/search?q=Codex%20MCP

建议关键词:

- `Claude Code`
- `Codex`
- `MCP`
- `API 代理`
- `OpenRouter`
- `LiteLLM`

### Reddit

搜索入口:

- https://www.reddit.com/search/?q=%22Claude%20Code%22%20%22MCP%22
- https://www.reddit.com/search/?q=%22Claude%20Code%22%20%22hooks%22
- https://www.reddit.com/search/?q=%22Claude%20Code%22%20%22subagents%22
- https://www.reddit.com/search/?q=%22Codex%22%20%22Claude%20Code%22

相关 subreddit:

- https://www.reddit.com/r/ClaudeCode/
- https://www.reddit.com/r/ClaudeAI/
- https://www.reddit.com/r/OpenAI/
- https://www.reddit.com/r/ChatGPTCoding/
- https://www.reddit.com/r/LocalLLaMA/

## GitHub/项目资料入口

- Context7 MCP: https://github.com/upstash/context7
- Playwright MCP: https://www.npmjs.com/package/@playwright/mcp
- Chrome DevTools MCP: https://github.com/ChromeDevTools/chrome-devtools-mcp
- GitHub MCP Server: https://github.com/github/github-mcp-server
- Anthropic official Claude plugins: https://github.com/anthropics/claude-plugins-official
- OpenAI skills examples: https://github.com/openai/skills
- Agent Skills specification: https://agentskills.io/specification
- MCP specification: https://modelcontextprotocol.io/
- LiteLLM docs: https://docs.litellm.ai/

## 本文档的边界

- 不包含基础安装、登录、普通 chat 用法。
- 不列价格表，因为价格、额度和 plan 权限变化很快，应以官方实时页面为准。
- 对社区观点只做归纳，不把未能直接核验的个人体验写成事实。
- 文档内示例需要按你的真实模型、权限、provider、token、组织策略调整。
