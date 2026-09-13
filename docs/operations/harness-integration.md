# Harness 集成

```bash
pnpm run test:integration -- /absolute/path/to/learning-helper
```

Harness checkout 必须已 install/build，满足 [固定基线](../../COMPATIBILITY.md)。默认检查 packages/apps 与 upstream 0 diff，不使用独立 branding worktree 的运行时代码。

脚本 build/pack、通过官方 dsh plugin 安装到独立临时 profile、dump config、认证 Web boot，在 standard Agent scope 检查七个工具注册并实际 dispatch 检索/阅读/状态和作者工具；不因此宣称已运行真实原件视觉。测试 observer 创建官方 Workspace A/B 和 Session，验证无 courseId、跨 Workspace read 拒绝、重启后引用、初始化/authoring/quiz/Weak/v2。v0.2 profile 只加载 Learning plugin，不额外组合全局学习 storage-domain provider。

默认同时运行 Chromium：原生 Workspace picker、初始化、TXT/Markdown/PDF 上传、工具卡片、作答、丢包重试、刷新、Workspace 切换、计划任务会话、1440/1024/390 light/dark。最后重启进程验证 Workspace 内 state.db/evidence.db。fixture 走真实 ToolRuntime/Session events，但不会调用真实模型，不冒充自主 Agent。`LH_BROWSER_SMOKE=0` 仅供后端排障。

`artifacts/integration-result.json` 记录 running/passed/failed、SHA、dirty 标记及实际包 hash；每次运行覆盖该文件，不能将当前内容当成历史验收。默认截图/细分结果在 artifacts/browser，可用 `LH_BROWSER_SCREENSHOTS` 改输出目录，均不入 Git。命令/进程等待有界，临时目录归本次 invocation 所有。

设置 `LH_DEMO_OUTPUT` 会将默认全面浏览器检查替换为[演示录制路径](../DEMO.md#仓库演示素材)，仍执行 packed Host 与进程重启断言。录制回执明确标为 recording，不能替代默认 browser smoke 的丢包重试/多尺寸等覆盖；不要同时设置 `LH_BROWSER_SMOKE=0`，否则不会录制。

手动 local link（从 Harness checkout 执行，插件需先 build）：

```bash
DSH_HOME=/tmp/learning-helper-dev pnpm dsh --profile learning-helper --from-default-profile web --dump-config
DSH_HOME=/tmp/learning-helper-dev pnpm dsh plugin --profile learning-helper add ../dsh-learning-helper
DSH_HOME=/tmp/learning-helper-dev pnpm dsh --profile learning-helper --dump-config
DSH_HOME=/tmp/learning-helper-dev pnpm dsh --profile learning-helper --no-open
```

打开进程提供的临时登录 URL，以官方 cookie 认证；不要共享 token。默认无 demo/全局课程；通过官方 Workspace UI 选择目录后初始化。原 v0.1 `demo`/`evidencePath` Config 已移除，不能继续注入旧 overlay。

Host 复用公开 WorkspaceRegistry/Agent session identity、defineTool/systemPrompt、Web connection、LLM/image attachment 服务。无 Workspace scope 生命周期假设：一个 profile plugin 实例按请求解析 Workspace，缓存有限连接。自定义 preset/system prompt 可能遮蔽 section，必须在自己的 composition 中验证。

最终发行使用 prebuilt tgz 与 exact remote SHA，部署所有权见 [运行壳](https://github.com/Develata/learning-helper/tree/feat/workspace-v02/deploy/learning-helper)。旧数据不会在启动时自动迁移，参见 [migration](migration-v1.md)。
