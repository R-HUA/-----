# Slash 命令、workflow 与并行代理对照

[返回索引](./README.md) | [Codex 高级教程](./02-codex-advanced.md) | [Claude Code 高级教程](./03-claude-code-advanced.md)

## 1. 命令对照速查

| 目标 | Codex | Claude Code |
| --- | --- | --- |
| 进入计划模式 | `/plan` | `/plan` |
| 设置长目标 | `/goal` | `/goal` |
| 查看会话状态 | `/status` | `/status`、`/usage`、`/context` |
| 切模型 | `/model` | `/model` |
| 切 reasoning/effort | `/model` 中选择 reasoning effort | `/effort` |
| 调权限 | `/permissions` | `/permissions` 或 Desktop mode selector |
| 查看 MCP | `/mcp` | `/mcp` |
| 管理 skills | `/skills` | `/skills` |
| 管理 plugins | `/plugins` | `/plugin`、`/reload-plugins` |
| 查看 hooks | `/hooks` | `/hooks`、`/debug` |
| 代码审查 | `/review` | `/code-review`、`/review`、`/security-review` |
| 查看 diff | `/diff` | `/diff`、Desktop diff pane |
| 临时侧问 | `/side`、`/btw` | `/btw` |
| 分叉会话 | `/fork` | `/fork`、`/branch` |
| 查看 subagents | `/agent` | `/agents` |
| 查看后台任务 | `/ps`、`/stop` 用于 background terminal | `/tasks`、`claude agents` |
| 动态大规模 workflow | 显式要求 subagents；Goal mode 持续推进 | `/workflows`、`/deep-research`、`ultracode`、`/batch` |

## 2. 计划优先模式

### Codex

```text
/plan 评估把 authentication service 拆成独立包的迁移方案，列出风险、步骤和验证命令
```

特点:

- 适合在动手前让 Codex 读文件、提出计划。
- 后续可用 `/goal` 固化成长期任务。
- CLI/app 都支持。

### Claude Code

```text
/plan
```

或 Desktop mode selector 选择 Plan mode。

特点:

- Claude 可读文件和运行探索命令，但不编辑源代码。
- 适合大型改动前让它先“explore first, then plan, then code”。

## 3. 长任务推进

### Codex `/goal`

适合目标有明确终点且需要多轮推进:

```text
/goal 完成 docs/ 下 API 文档重构。要求: 所有旧链接可跳转，新索引可达，每篇文档有来源链接，最后运行 markdown lint。
```

使用策略:

- 目标短而明确。
- 复杂验收标准写入文件，如 `docs/migration-goal.md`。
- 目标活跃时用普通消息修正优先级。

### Claude Code `/goal`

Claude Code `/goal` 让 Claude 持续工作到 completion condition 成立。适合:

- “直到测试全绿”。
- “直到某个 PR checklist 完成”。
- “直到 CI 报告不再失败”。

配合 `/tasks`、Desktop background tasks、agent view 可观察进度。

## 4. 并行代理

### Codex subagents

Codex 只在你明确要求时使用 subagents:

```text
Spawn four subagents:
1. security reviewer
2. test-gap reviewer
3. performance reviewer
4. docs reviewer
Wait for all results, then merge findings by severity.
```

优势:

- 控制简单。
- 主线程保留决策和最终结论。
- 适合 read-heavy 审查。

风险:

- 写操作冲突。
- token 成本增加。
- 每个 agent 都会消耗工具调用和上下文。

### Claude Code subagents

Claude Code 有内置和自定义 subagents。调用方式:

```text
Use the code-reviewer subagent to inspect auth and billing modules, then return only P0/P1 findings.
```

或:

```text
/fork draft tests for the current implementation while I keep working
```

优势:

- 自定义 subagent 配置丰富: tools、model、permissionMode、hooks、skills、isolation、background。
- Explore/Plan 可减少主上下文污染。
- fork 可继承当前完整上下文。

## 5. Dynamic workflows 与 `/batch`

Claude Code 的 dynamic workflow 是本目录中最接近“动态 workflow”的能力。

### `/deep-research`

```text
/deep-research 比较 Codex 与 Claude Code 在 MCP tool search 上的设计差异，要求列出处和版本限制
```

流程:

1. workflow 后台启动。
2. 多个 agents 分角度搜索。
3. 交叉验证 claims。
4. 返回带引用报告。

### `ultracode`

```text
ultracode: migrate every legacy route handler to the new auth middleware and verify each package.
```

`ultracode` 会让 Claude 写 workflow 脚本，而不是在主线程逐步执行。

### `/batch`

```text
/batch migrate src/ from Solid to React
```

`/batch` 是 bundled skill: 研究代码库，拆成 5-30 个独立单元，为每个单元创建 worktree-isolated subagent，最后各自开 PR。适合结构化大迁移，但需要任务可拆分且 repo 是 git。

## 6. Review 命令差异

### Codex `/review`

Codex review 默认强调:

- 行为回归。
- 安全风险。
- 高优先级 bug。
- 测试缺口。

适合在 Codex 改完后立刻跑一次本地审查。

### Claude `/code-review`

Claude Code 的 `/code-review [low|medium|high|xhigh|max|ultra] [--fix] [--comment] [target]` 更像完整 review command:

```text
/code-review high --fix
```

```text
/code-review ultra
```

- `--fix`: 自动应用发现的问题。
- `--comment`: 作为 GitHub PR inline comment。
- `ultra`: cloud multi-agent review。

## 7. 推荐 prompt 模板

### 并行审查模板

```text
Use parallel agents for read-only review. Split by concern:
security, correctness, test gaps, and maintainability.
Each agent should return only confirmed findings with file references.
Wait for all agents, deduplicate, then present P0/P1 first.
Do not modify files until I approve.
```

### Workflow 生成模板

```text
Use a workflow for this task. First create a small pilot plan on one package.
If the pilot succeeds, fan out to the remaining packages.
Cross-check each agent's result with tests or static analysis.
Return a final table: package, changes made, verification, unresolved risk.
```

### 长目标模板

```text
Set a persistent goal for this thread:
Finish <task>. Completion means:
1. <observable condition>
2. <verification command>
3. <documentation or diff requirement>
Pause and ask if a dependency, credential, or destructive action is required.
```

