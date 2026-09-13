# v0.1 → Workspace v0.2

v0.1.0 tag 保持不变。不会在容器启动或打开 UI 时迁移、删除或重置旧全局数据库。

1. 停止使用旧 profile/容器，备份整个 DSH_HOME/volume；保留 v0.1 镜像和 tag。迁移要求旧数据处于 offline 状态，两个数据库不做分布式快照。
2. 准备并在 Harness 注册一个本地 Workspace。目标不能已有 `.learning-helper` 或 `learning-assets`，其它用户文件不修改。
3. 在插件 checkout 构建后运行：

```bash
pnpm build
pnpm migrate:v1 -- --course <旧CourseID> --workspace /absolute/workspace --dsh-home /absolute/old-dsh-home --offline
```

读取 `<old-dsh-home>/learning-helper/{state,evidence}.db` 的 SQLite backup 副本，通过公开 Harness storage API 验证学习状态。旧库不原地写。迁移范围包含 concepts/states/plans/quizzes/attempts/review/revisions/submissions 和全部本课 Sources/chunks；引用不全则拒绝激活。

TXT/Markdown 从已有 chunk 还原可验证的规范化全文。v0.1 未保存原始上传 bytes，因此这些资产明确标记为 reconstructed normalized text，不伪造原始文件。旧 Course ID 成为稳定 projectId，原 chunk/citation 保留。相同旧数据再次执行返回 deduplicated；不同数据/已初始化目标冲突。

4. 打开该 Workspace 的 Session，检查学习面板进度、计划、已交练习和 Sources；测试有完整 v1 fixture 比较及原数据库哈希检查。
5. 回滚只需重新运行 v0.1 profile/镜像和原备份；v0.2 Workspace 不会被反写到旧库。

激活先发布 learning-assets，再以 `.learning-helper/manifest.json` 所在完整目录作为最后 marker。若进程恰在两次 rename 间退出，保留 `.learning-helper-migration-*` 临时目录和已发布 assets；不要再次覆盖目标或删除资料。确认原库未变后，可将该 stage 内 `.learning-helper` 移到目标完成激活，或把本次 assets 一并移回 stage 保留后重新迁移。操作前备份这两个路径；不存在 silent reset。
