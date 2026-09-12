# 本地开发

Node/pnpm 基线见 [COMPATIBILITY](../../COMPATIBILITY.md)。插件可独立于 Harness checkout 开发：

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test
pnpm demo
pnpm demo:evidence
pnpm demo:authoring
pnpm run build
pnpm pack --pack-destination artifacts
codegraph sync
```

`pnpm demo` 使用真实 Harness storage-domain/SQLite 包，在临时目录执行固定 5 题提交并显示 Day 2 变更；退出清理 fixture 数据。`pnpm test` 包含 body 10 秒超时测试，总时长通常约 11 秒；它不调用 LLM。Evidence 测试另包含 5 秒 parser timeout；与原有超时测试并行执行。

`pnpm-workspace.yaml` 只允许确切 esbuild 版本的安装脚本，供 tsx 使用；其余没有统一开放。package.json 的直接依赖固定版本，传递依赖由 lockfile 固定，无 workspace/file/link sibling 依赖。

Harness 自身在其 checkout 执行 `pnpm install --frozen-lockfile`、`pnpm run build`。集成操作见 [harness-integration](harness-integration.md)。`.codegraph/`、node_modules、dist、artifacts、.env 不提交；代码变化后 sync 索引，不能提交 graph DB。

`pnpm demo:evidence` 在独立临时 state.db/evidence.db 中创建空课程、导入原创 lecture-03.md、检索并打印真实 citation 与全文。没有 LLM 调用。`demo/math-analysis/injection.txt` 是指令注入测试资料，仅作为不可信文本读取。所有普通 tests 均使用真实本地 DB；`tests/course-tools.test.ts` 使用正式 DSH registry dispatch。

真实模型验收需要先在 Harness 配置可用 LLM 凭证（不要提交 key），通过安装本插件的 Web 会话提问“为什么闭区间上的连续函数一定一致连续？”，检查日志实际出现 search/read，答案的 machine references 必须来自该次 read。P3 验证时本机只有 browser-session credential，无模型 credential；未执行该 semantic smoke。操作顺序与判据见 [golden path](../acceptance/golden-path.md)。

`pnpm demo:authoring` 创建隔离课程/资料，使用真实 ToolRuntime dispatch search/read/outline/plan/quiz/state，经 LearningService.submit 生成 weak、review 与 v2，打印 Day 2 变化。它使用手工 draft 与答案，输出明确标识 semanticLlmRun=false。发布失败后用相同 draft 重试；outline/初始 plan 不支持覆盖，quiz 完全相同内容不生成新副本。
