# Module ownership

| 模块 | Authority / 依赖方向 |
|---|---|
| domain / policy | 结构、不变量、确定性评分/适应策略；不依赖数据库、模型或 UI |
| services/learning | 唯一学习 mutation owner；验证发布与提交，经 LearningStore 原子更新聚合 |
| services/authoring、student | AuthoringService 读取 Evidence 验证引用后调用 LearningService；student 仅派生学生只读投影，不写学习状态 |
| workspace | 公开 Session membership → root/manifest；每次请求重新解析；最多 8 个有界缓存的 WorkspaceProject handles，不是全局 Course registry |
| providers/workspace-state | 每 Workspace 的单 aggregate SQLite；沿用现有 state-schema/replay，单写队列 |
| providers/workspace-evidence | Source/generation/chunks/FTS、canonical 文件与容量；active switch 原子，历史 chunk 不删除 |
| services/pdf、assetization | PDF archive→解析→验证→代际提交；视觉结果和 MinerU 均为不可信 draft |
| providers/pdf-*、harness-vision、mineru* | PDF.js Worker、公开 Harness LLM/attachment、MinerU 自托管 protocol2 / cloud v4 与受限 ZIP；不访问学习状态 |
| services/mineru-access | 通过公开 Harness credentials record 保存每个稳定 projectId 的云端密钥，返回无 secret 的状态；构建所选 adapter，Workspace 文件不拥有密钥 |
| host / tools | authenticated Session address / exec.agent.session.id → WorkspaceProjects；只适配输入输出，不选 filesystem scope |
| client | Harness Session/Workspace observable、原生 sidebar/tool views；浏览器仅保存选择、草稿、请求状态和任务会话书签 |

CourseAuthoringService 验证当前项目 evidence 后，通过 LearningService 提交。Agent 不能写 mastery、Attempt、adaptive plan。资料写路径由 Workspace owner 验证；所有 durable asset 路径为相对路径。公开输出经 projectView 更换外部词汇，不改变领域算法。

旧 HarnessLearningStore/SqliteEvidenceStore 仅用于 v0.1 回归与显式迁移，v0.2 Host 不加载全局 learning domain。迁移读副本时使用公开 storage-domain/storage-sqlite export；不解析 Harness 私有表。

TaskSessions 仍只拥有 browser bookmarks；真实会话和模型配置由 Harness 拥有。[ADR-0004](../adr/0004-task-session-bookmarks.md) 的存储权责保留，v0.2 会话必须有有效 Workspace，不能 fallback 到 cwd/上次项目。
