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

DocumentParser 由 PlainTextParser 起步；MinerUParser 负责 PDF/OCR/公式结构，失败进入明确 failed 状态，可重试或文本 fallback。EvidenceIndex 独立采用 SQLite FTS5/BM25。NotebookLM → EvidenceProvider、Obsidian → LearningExportSink、DeepTutor → TutorProvider 均 deferred。
