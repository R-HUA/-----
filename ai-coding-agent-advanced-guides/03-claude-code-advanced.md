# Claude Code 高级教程

[返回索引](./README.md) | [命令/workflow 对照](./04-commands-workflows-agents.md) | [第三方集成](./05-third-party-api-mcp-gateways.md) | [来源](./07-sources.md)

## 1. 桌面版与 CLI 的定位

Claude Code 覆盖 terminal、IDE、Desktop app、browser。这里重点是 Desktop Code tab 与 CLI。

Desktop 更适合:

- 多 session 并行，每个 session 有独立项目、历史和代码变更。
- 图形化 diff 评论、preview、terminal、file editor、plan/tasks/subagent pane。
- PR CI 状态监控、auto-fix、auto-merge。
- 本地、远程 cloud、SSH session 切换。
- 从手机 Dispatch 任务、scheduled tasks。

CLI 更适合:

- SSH、脚本、`claude -p`、CI/CD。
- 精细 flags、`--agents`、`--worktree`、`--permission-mode`。
- 直接使用 `/agents`、`/permissions`、`/doctor` 等 terminal panel command。
- Bedrock、Vertex、Foundry 等第三方 provider。

Desktop 和 CLI 共享:

- `CLAUDE.md` / `CLAUDE.local.md`
- `~/.claude.json`、`~/.claude/settings.json`
- `.mcp.json`
- hooks、skills、MCP、settings permission rules

## 2. Claude Code CLI 高级命令

Claude Code 的 `/commands` 官方表非常密集。高级用法可以按阶段理解。

### 会话开始

| 命令 | 用途 |
| --- | --- |
| `/init` | 生成 starter `CLAUDE.md` |
| `/memory` | 调整项目记忆 |
| `/mcp` | 配置/查看 MCP |
| `/agents` | 管理 subagents |
| `/permissions` | 管理权限规则 |

### 执行中

| 命令 | 用途 |
| --- | --- |
| `/plan` | 先分析和计划，暂不改代码 |
| `/model` | 切模型 |
| `/effort` | 调整 reasoning effort，支持 `ultracode` 时可触发 workflow 编排 |
| `/context` | 查看 context 用量和优化建议 |
| `/compact` | 压缩上下文 |
| `/btw` | 侧问，不写入主历史 |
| `/tasks` | 查看后台任务 |

### 并行/后台

| 命令 | 用途 |
| --- | --- |
| `/agents` | 查看 running subagents 和 library |
| `/fork` | 从当前上下文分叉一个 subagent |
| `/background` 或 `/bg` | 把当前 session 变成 background agent |
| `/batch <instruction>` | 把大任务拆成 5 到 30 个 worktree-isolated subagents |
| `/workflows` | 查看 dynamic workflow 进度 |

### 交付前

| 命令 | 用途 |
| --- | --- |
| `/diff` | 查看变更 |
| `/code-review [effort] [--fix]` | 审查并可自动修复 |
| `/simplify` | 清理/简化 review |
| `/review` | 更深的只读审查 |
| `/security-review` | 安全审查 |
| `/code-review ultra` | 云端 multi-agent 深度 review |

### 跨 session

| 命令 | 用途 |
| --- | --- |
| `/resume` | 恢复旧 session |
| `/branch` | 从当前点创建 conversation branch |
| `/teleport` | 把 web session 拉回 terminal |
| `/remote-control` | 从其他设备继续本地 session |
| `/desktop` | 把 CLI session 移到 Desktop Code tab |

## 3. Dynamic workflows

Dynamic workflow 是 Claude Code 2026 年的重点高级能力。它不是普通 prompt，而是 Claude 为任务写一段 JavaScript 编排脚本，由 runtime 在后台执行。

适用:

- 代码库级安全/bug sweep。
- 大规模迁移。
- 多来源交叉验证研究。
- 需要把中间结果留在脚本变量而不是主上下文的任务。

不适用:

- 小改动。
- 需要频繁人工 sign-off 的每一步。
- 强依赖即时交互的任务。

### 运行内置 workflow

```text
/deep-research What changed in the Node.js permission model between v20 and v22?
```

随后:

```text
/workflows
```

在进度视图中可查看 phase、agent 数量、token、耗时，并暂停、恢复、停止、重启 agent、保存 workflow。

### 让 Claude 写 workflow

```text
ultracode: audit every API endpoint under src/routes/ for missing auth checks
```

也可以自然语言要求:

```text
Use a workflow to migrate the legacy API clients in packages/* and cross-check the result with tests.
```

### 保存 workflow 为命令

在 `/workflows` 里选择完成的 run，按 `s` 保存:

- 项目级: `.claude/workflows/`
- 个人级: `~/.claude/workflows/`

以后可以像 slash command 一样调用。

## 4. Subagents

Claude Code 的 subagents 是隔离上下文的专业 worker。内置 subagents 包括:

- Explore: 快速、只读、偏代码搜索。
- Plan: plan mode 中用于收集上下文。
- general-purpose: 复杂多步任务，能探索和执行。

自定义 subagent 文件:

```md
---
name: code-reviewer
description: Expert code review specialist. Use immediately after writing or modifying code.
tools: Read, Grep, Glob, Bash
model: inherit
---

Review code for correctness, security, maintainability, and test coverage.
Prioritize concrete bugs and regressions. Return findings with file references.
```

位置:

| 位置 | 范围 |
| --- | --- |
| `.claude/agents/` | 项目级，可提交到 repo |
| `~/.claude/agents/` | 个人全局 |
| plugin `agents/` | 插件提供 |
| `--agents` | 当前 CLI session 临时定义 |

### forked subagent

`/fork` 会让 subagent 继承当前完整 conversation，而不是从空上下文开始。适合:

- 同一个背景下同时尝试两个方案。
- 边实现边让分叉写测试。
- 主线程不想被大量工具输出污染。

```text
/fork draft unit tests for the parser changes so far
```

## 5. Hooks

Claude Code hooks 的事件比 Codex 更细，支持 command、HTTP、MCP tool、prompt、agent hook。

常见事件:

- `SessionStart` / `SessionEnd`
- `UserPromptSubmit` / `UserPromptExpansion`
- `PreToolUse` / `PermissionRequest` / `PostToolUse`
- `PostToolBatch`
- `SubagentStart` / `SubagentStop`
- `TaskCreated` / `TaskCompleted`
- `PreCompact` / `PostCompact`
- `Elicitation` / `ElicitationResult`
- `FileChanged` / `WorktreeCreate` / `WorktreeRemove`

阻止危险 Bash 示例:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "if": "Bash(rm *)",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/block-rm.sh",
            "args": []
          }
        ]
      }
    ]
  }
}
```

异步测试 hook:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/run-tests-async.sh",
            "async": true,
            "timeout": 300
          }
        ]
      }
    ]
  }
}
```

注意:

- command hooks 以系统用户权限运行。
- prompt/agent hook 可做智能判断，但生产环境优先 command hook。
- async hook 不能阻止已经发生的操作，只能在后续 turn 注入结果。

## 6. MCP

Claude Code 支持 HTTP、SSE、stdio、WebSocket MCP server，并支持:

- project/local/user scope。
- `.mcp.json`、`~/.claude.json`、`claude mcp add-json`。
- dynamic tool updates。
- 自动重连。
- MCP prompts 作为 `/mcp__server__prompt` 命令。
- tool search: 不把所有 tool schema 一次性塞进 context。
- MCP channels: 外部事件推入当前 session。

HTTP 示例:

```bash
claude mcp add --transport http notion https://mcp.notion.com/mcp
```

stdio 示例:

```bash
claude mcp add --env AIRTABLE_API_KEY=YOUR_KEY --transport stdio airtable \
  -- npx -y airtable-mcp-server
```

查看:

```text
/mcp
```

## 7. Desktop 高级工作流

### 可视化实现循环

1. Prompt 中描述任务。
2. 让 Claude 修改代码。
3. 打开 diff pane 查看变更。
4. 在 diff 行上评论。
5. Claude 根据评论继续修改。
6. preview pane 中自动启动 dev server 并验证。
7. PR 后开启 CI auto-fix。

### 权限模式

| 模式 | 适合 |
| --- | --- |
| Ask permissions | 初次使用、敏感代码 |
| Auto accept edits | 信任文件变更，但命令仍需确认 |
| Plan mode | 复杂任务先探查和规划 |
| Auto | 降低提示，后台 safety check |
| Bypass permissions | 仅限隔离环境 |

### CLI 到 Desktop

在 CLI:

```text
/desktop
```

限制:

- macOS/Windows 可用。
- 需要 Claude subscription。
- API key、Bedrock、Vertex、Foundry 认证下不可用。

