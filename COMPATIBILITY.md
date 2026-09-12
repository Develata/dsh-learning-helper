# Compatibility

Plugin 0.1.0 的 P1–P4 backend/client loop 已测试于 Harness **0.1.5-rc.2**，exact SHA `c291e7961a515f6d7af9304e7fd1d257929aef26`。Node **24.18.0**；开发/packed profile pnpm **11.7.0**。

复验 fork HEAD：`976e161b99136103ec6a64f8cc31f9d64f1bc5d1`。运行时仍固定上述 upstream SHA；允许后代提交仅改变根目录 `LEARNING_HELPER.md`、`UPSTREAM_BASE.md`、`UPSTREAM_PATCHES.md`。其余 tracked/untracked 源文件必须与固定基线一致；具体运行 HEAD 与包摘要写入集成验收回执。

验证：独立 build/typecheck/test/pack；local link install；prebuilt tarball install + config dump + authenticated Web HTML/JS/CSS + Host Course/import + standard Agent 作用域七工具 dispatch + prompt assembly + grounded authoring + P1 submit + 双 DB process restart。另通过 packed Web 的 Learning 入口、课程上传、交互 Quiz、反馈/刷新、Why changed 与 native tool cards 浏览器验收；不声称真实 LLM 或最终交付已完成。详细证据与缺口见 [acceptance](docs/acceptance/matrix.md)。

Host 依赖公开 Cordis、storage-domain、storage-sqlite、webServer、Connection、defineTool、systemPrompt.section contract，版本由 package.json/pnpm-lock.yaml 固定。Client 使用公开 dsh.client manifest、./client export、native sidebar/slots/inputActions、共享 React 18.3.1 与 UI primitives。esbuild 0.28.1 生成该 SHA 的 lazy CommonJS factory；没有私有 runtime import。浏览器验收使用 Harness 自带 Playwright 1.61.1 / Chromium headless shell 149.0.7827.55，不是插件的新增测试框架依赖。

不承诺 works with latest；升级任何 pre-stable Harness API 后重跑 `pnpm run test:integration -- /absolute/path/to/learning-helper`，并审查/更新脚本的 exact upstream SHA 与运行时差异检查。

Evidence 使用 Node 内置 node:sqlite；实际测试 Node 24.18.0 FTS5，另以关闭 FTS 的实例验证有界 literal fallback。Node 22.19+ 符合声明 engines，本轮没有单独执行 Node 22 的版本矩阵。插件源码无需 sibling checkout，只有 Harness 集成脚本依赖固定 checkout。
