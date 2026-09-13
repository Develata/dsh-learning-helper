# Compatibility

v0.2.1 固定 DeepSeek Harness **0.1.5-rc.2** / upstream **c291e7961a515f6d7af9304e7fd1d257929aef26**；Node **24.18.0**、pnpm **11.7.0**。不承诺 latest。v0.1.0 验收是 [独立历史记录](docs/acceptance/final-delivery.md)，升级需要显式 [migration](docs/operations/migration-v1.md)。

Host 使用公开 Cordis、WorkspaceRegistry、Agent/session、LLM/image attachment、Web/Connection、defineTool、systemPrompt contract。运行时 Learning state 与 evidence 使用 Workspace-local node:sqlite，不依赖 storage-sqlite 私有实现；旧 storage-domain 依赖保留给迁移和回归。

Client 使用公开 dsh.client/./client/native sidebar/slots、ISessions/IWorkspaces、inputActions，共享 React 18.3.1。esbuild 0.28.1 构建 lazy client factory；browser tests 使用 Harness 的 Playwright 1.61.1/Chromium 149。真实PDF解析采用 pdfjs-dist 6.3.289，Worker使用其公开 legacy API。独立 install/typecheck/test/build/pack 无 sibling依赖，集成脚本才需要固定 Harness checkout。

MinerU adapter 对接官方自托管 protocol 2，参考 upstream 4fe4bde114a23ee5dd637eae99b767f4669bf58c；不声称兼容 SaaS v4或任意wrapper。视觉取决于运行中 Session 选定模型的公开 image capability。当前验证结果和未运行项见 [CURRENT](docs/CURRENT.md)。

默认 runtime diff gate 要求 fork packages/apps 相对上述 SHA 为0。已有独立 branding分支 allowlist留作旧功能兼容，v0.2开发不合入。Docker lock中的harnessForkSha是实际build-input提交，非包含lock文件的自引用提交；最终运行壳metadata pin最终remote pluginSHA。v0.1 tag不修改。

依赖复核记录（2026-09-13）：插件 `pnpm audit --prod` 为0；从实测插件 `aad1263221da277f70ca1d724aff4e83fad29be2` 的 Docker runtime 提取manifest/lock，审计为24条（11 high、12 moderate、1 low、0 critical），分类为固定upstream传递风险，不擅自升级。这是对应lock/runtime的历史检查，不是每轮文档编辑重新audit的结论。

v0.2新增PDF与图片处理，不能沿用v0.1“TXT路径不调用图片解析”的适用性结论；PDF.js Worker、页/字节/输出配额限制资源消耗，但不等于修复整个Harness的漏洞或形成完整沙箱。仍限本机单用户、loopback认证部署；未做全runtime exploit验证。原始结果在本机artifacts/v02-runtime-audit.json；当前源码、已推送版本与实测镜像的关系见 [CURRENT](docs/CURRENT.md)。
