# Compatibility

Plugin 0.1.0 的第一轮 vertical slice 已测试于 Harness **0.1.5-rc.2**，exact SHA `c291e7961a515f6d7af9304e7fd1d257929aef26`。Node **24.18.0**；开发/packed profile pnpm **11.7.0**。

验证：独立 build/typecheck/test/pack；local link install；prebuilt tarball install + config dump + authenticated Web HTML/JS/CSS + Host submit + process restart。未声称真实 LLM、Quiz UI 或完整 MVP 已完成。详细证据与缺口见 [acceptance](docs/acceptance/matrix.md)。

Host 依赖公开 Cordis、storage-domain、storage-sqlite、webServer、Connection contract，版本由 package.json/pnpm-lock.yaml 固定。Client entry 目前没有需要注册的界面，未声明 dsh.client；后续须使用当前模块 factory contract。

不承诺 works with latest；升级任何 pre-stable Harness API 后重跑 `pnpm run test:integration -- /absolute/path/to/learning-helper`，并审查/更新脚本的 exact SHA assertion。
