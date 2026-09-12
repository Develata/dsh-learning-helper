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

`pnpm-workspace.yaml` 只允许确切 esbuild 版本的安装脚本，供 tsx 与 client bundler 使用；其余没有统一开放。package.json 的直接依赖固定版本，传递依赖由 lockfile 固定，无 workspace/file/link sibling 依赖。

Harness 自身在其 checkout 执行 `pnpm install --frozen-lockfile`、`pnpm run build`。集成操作见 [harness-integration](harness-integration.md)。`.codegraph/`、node_modules、dist、artifacts、.env 不提交；代码变化后 sync 索引，不能提交 graph DB。

`pnpm demo:evidence` 在独立临时 state.db/evidence.db 中创建空课程、导入原创 lecture-03.md、检索并打印真实 citation 与全文。没有 LLM 调用。`demo/math-analysis/injection.txt` 是指令注入测试资料，仅作为不可信文本读取。所有普通 tests 均使用真实本地 DB；`tests/course-tools.test.ts` 使用正式 DSH registry dispatch。

真实模型通过 `pnpm acceptance:llm -- /absolute/path/to/learning-helper` 验收。它使用 Harness 官方已配置的 provider、标准 Agent 和临时 packed profile；凭证不复制到仓库。步骤、隔离边界和语义判据见 [模型验收](real-llm.md)，最近结果由 [CURRENT](../CURRENT.md) 记录。

`pnpm demo:authoring` 创建隔离课程/资料，使用真实 ToolRuntime dispatch search/read/outline/plan/quiz/state，经 LearningService.submit 生成 weak、review 与 v2，打印 Day 2 变化。它使用手工 draft 与答案，输出明确标识 semanticLlmRun=false。发布失败后用相同 draft 重试；outline/初始 plan 不支持覆盖，quiz 完全相同内容不生成新副本。

P4 使用同一 package 的 TSX client：build 产生 Host dist/index.js、类型声明及浏览器 dist/client.js，pack 同时包含两者；没有 sibling 源码依赖。`pnpm test` 同时执行 backend 与 `pnpm run test:client`（纯 model/API），assembled DOM 验证由集成脚本使用 Harness 已有 Playwright，插件不新增浏览器测试框架依赖。

浏览器验收前，在 Harness 的 apps/web 执行 `pnpm exec playwright install chromium --only-shell` 安装当前锁定 Playwright 对应的 Chromium。然后在插件执行 `pnpm run test:integration -- /absolute/path/to/learning-helper`；默认包含浏览器闭环，`LH_BROWSER_SMOKE=0` 仅用于后端诊断，不满足 P4 验收。截图与 JSON 回执在本地 artifacts/browser，不提交。

学生操作：打开 session → 学习 → 新建课程/上传资料 → 生成计划快捷动作并确认发送 → Agent 发布后点击卡片打开当前计划/练习。没有模型配置时可运行确定性 demos/browser smoke，但不能完成自主 Agent 学习。约 1024px 建议用右上角原生全屏或收起左侧工作区栏；390px 自动全屏。
