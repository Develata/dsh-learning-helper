# 集成边界与审查

审查基线：Harness `c291e7961a515f6d7af9304e7fd1d257929aef26`（0.1.5-rc.2），2026-09-12。Node 24.18.0，仓库要求 pnpm 11.7.0；两仓初始 clean，origin/upstream 已正确设置。

| 分类 | 决定与源码证据（Harness checkout 相对路径） |
|---|---|
| UPSTREAM | bundle `dsh.bundle.patch` 与 profile：`docs/user/develop/basic/publish.md`、`apps/cli/reference/README.md`；无需 launcher patch |
| UPSTREAM | Host `WebServer.register`：`packages/host/webserver/src/index.ts`；提供 exact/prefix route 与 disposer；carrier 不负责全局认证，插件在路由入口调用 `packages/client/connection/src/rpc-host.ts` 的 `requestRejection` |
| UPSTREAM | Client `dsh.client` + `./client`：`docs/subsystems/client-modules.md`、`packages/client/modules`；factory 通过 `__ModuleLoader__.load` 注册 |
| UPSTREAM | slots / tool views：`packages/client/ui-slots`、`packages/client/ui-tool`；UI 可以独立 package face |
| UPSTREAM | `DomainFacility.open` / `KvTable.update`：`packages/storage/storage-domain/src`；SQLite：`packages/storage/storage-sqlite/src` |
| UPSTREAM | Agent `defineTool` / tools registry：`packages/core/tools`；per-session preset：`packages/preset/agent-presets` |
| UPSTREAM | attachment、MCP 与 extensions 保持各自语义；不以 session-query 存课程资料 |
| PATCH | 无。Expected Harness core files modified: **0** |
| NEW | Learning domain/policy/services/providers/host/tools/client 与控制文档 |
| OPTIONAL | OpenFile/MinerU；不阻塞第一轮闭环 |

存储实现核实：update transform 在单域写队列内运行，backend durability 后更新内存；失败不改变内存；close 拒绝新写并 drain。无跨表事务/索引/自动迁移。该 SHA 的写路径信任 typed caller，插件自行校验写入。

[dsh-teacher](https://github.com/Yihong89/dsh-teacher) 的 package/README/patch 与 MIT LICENSE 已阅读：可参考双 face、quiz submit 与 tool view 思路，当前 patch 为空并要求 preset opt-in；本轮不复制其代码、不引入依赖。其 LLM grading 不适合本项目真值要求。

[dsh-open-file](https://github.com/hyper-dsh-plugins/dsh-open-file) 公开 tool 为 file_inspect/read/ocr/render，HTTP 公开说明主要为 session-bound upload；package 0.1.2-rc.1 peers 固定旧 Harness，README 兼容表也有版本差异。尚未证明可复用的稳定 document-parser Host API，不导入私有实现；后续先工具适配并验证版本。

P2：DocumentParser 的 TextParser 实现 TXT/MD；SqliteEvidenceStore 使用 Node 内置 SQLite 与独立 evidence.db，实际 runtime FTS5 probe 和 literal fallback 测试通过。公开 defineTool / systemPrompt.section 挂载三只读工具与静态 grounding policy；真实 packed Host 的 registry dispatch 和 prompt assembly 已验收。当前没接入 Client extension。

OpenFile 复验（2026-09-12）：npm 0.1.2-rc.1 / Git HEAD `39636d198993c5980da0091056d307bb5a8a48c5`。隔离目录中固定 Harness 0.1.5-rc.2，`pnpm install --lockfile-only --strict-peer-dependencies --ignore-scripts` 返回 ERR_PNPM_PEER_DEP_ISSUES；agent/tools/skill/session/webserver 等要求精确 0.1.2-rc.1，实际安装 0.1.5-rc.2。未 force/override，未加载其 runtime，不能宣称兼容。公开 API 仍为 file_inspect/read/ocr/render，未证明稳定 parser Host API；probe 回执位于本地 artifacts/openfile-probe.json。

PDF/MinerU、NotebookLM → EvidenceProvider、Obsidian → LearningExportSink、DeepTutor → TutorProvider 均 deferred；TXT/MD Hard Gate 不依赖它们。
