# 实现导航

CodeGraph/代码拥有当前事实；本文件只导航，设计见 architecture/contracts。

- `src/index.ts` → `WorkspaceProjects` / `WorkspaceResolver` → 每次 Session 到官方 Workspace membership；最多8个本地项目handle。
- `workspace/context.ts`：manifest/init；`workspace/files.ts`：path containment；`workspace/migration.ts`：显式v1快照迁移。
- `providers/workspace-state.ts` → LearningService → 原有 learner replay / grading / adaptation。
- `providers/workspace-evidence.ts` → generations / FTS / historical read；`services/evidence.ts` → TXT parser。
- `services/pdf.ts` → PDF.js Worker (`pdf-parser/pdf-worker`) / `HarnessDocumentVision`；原件不可变、派生generation原子切换。
- `services/assetization.ts` → `MinerUAssetizer` protocol2 / `MinerUCloudAssetizer` SaaS v4；job recovery / quota / provenance。`providers/mineru-zip.ts` 受限解包；`services/mineru-access.ts` 通过正式 Harness credentials 保存每 Workspace 云端密钥。
- `tools/workspace-tools.ts`：7个已注册工具，无Agent courseId；`policy/grounding.ts`一份可信policy。
- `host/workspace-http.ts`：authenticated Session地址；`client/index.tsx`/`panel.tsx`：官方Session/Workspacehooks。
- `client/course.tsx`资料/初始化，`mineru-settings.tsx`服务选择/密钥设置；`plan.tsx`/`quiz.tsx`学习闭环；`task-session-port.ts`公开session调用；tool views只展示。
- `client/learning-content.tsx`：学习内容统一接入公开 MarkdownText/KaTeX；`scripts/math-browser-checks.mjs` 在 packed Web 中验证排版、公式选项与不可信内容回退。
- `scripts/harness-smoke.mjs`：packed/认证/重启与默认完整浏览器检查；`record-demo.mjs` 是 `LH_DEMO_OUTPUT` 显式选择的演示分支，产出docs素材，不是产品入口。
- v1 `storage-domain` / `evidence-sqlite` / old tools仅用于显式迁移和保留回归证明，不由v2入口注册。

查询示例：`codegraph explore 'WorkspaceProjects registerWorkspaceTools'`；`codegraph explore 'PdfSources Assetization activate'`；`codegraph explore 'LearningService submit getDashboard'`。
