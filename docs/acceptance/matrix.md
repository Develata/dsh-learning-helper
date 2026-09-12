# 验收矩阵

执行环境与命令日期由 [CURRENT](../CURRENT.md) 记录；下面只保存能力与证据关联。

| Capability | Status | Proof / Test | Demo step |
|---|---|---|---|
| CodeGraph 双仓初始化 | verified | 1.6.0 init/status，插件实现后 sync | Agent 导航 |
| Harness core patch = 0 | verified | `git diff --name-only`：packages/apps 无变更；[audit](../architecture/integrations.md) | 安装 |
| Bundle 独立 install/typecheck/build/pack | verified | 独立临时副本中 install/typecheck/test/build/pack；运行与测试数见 CURRENT，tgz 含 dist/manifest/docs | 打开 |
| Fixture 5 题确定性 adaptation | verified | `tests/learning.test.ts`：两错→weak→review→v2；预算与旧计划保留 | 提交→Day 2 |
| 幂等/并发/故障/恢复 | verified | 相同提交不再写；不同 quiz 并发无丢失；SQLite lock 整体失败；新 Node 进程恢复 | 反馈持久化 |
| 派生状态与复习证据一致性 | verified | `tests/learning.test.ts`：拒绝无证据的 mastery/status；SQLite 重启拒绝篡改的状态、重复错误和答对记录的修订引用，不重置数据 | 学习状态 |
| 合法输入的重规划边界 | verified | `tests/adaptation-boundaries.test.ts`：长概念名、任务 ID 碰撞、完成任务/待办任务达上限时仍正确提交 | 提交→Day 2 |
| Host API 输入与答案隔离 | verified | `tests/http.test.ts`：无 key 投影、拒绝错误输入、body size/time bound、Harness 拒绝回执 | Quiz Host |
| 真实 Harness local link / tarball / Web boot | verified | local `dsh plugin add` 与 `scripts/harness-smoke.mjs`；会话校验、静态资源、新进程复用 receipt | 运行壳 |
| Harness 固定基线检查 | verified | `tests/harness-checkout.test.mjs`：CLI 参数、发行说明后代提交、拒绝 committed/staged/unstaged/untracked runtime drift | 安装 |
| 空 Course lifecycle | verified | tests/course-lifecycle.test.ts：空集合/plan=null、无 plan 拒绝 practice；P1 完整 fixture 仍合法 | 创建 |
| TXT/MD 导入、hash 去重与容量 | verified | tests/evidence.test.ts / evidence-http.test.ts：normalize/dedupe、独立 body bound、Source/Chunk/corpus 上限 | 上传 |
| Evidence 隔离与稳定引用 | verified | 英中/LaTeX search、read 顺序/总量/wrong-course、locator/hash 校验、Markdown 标签与 Unicode 边界回归 | 检索/引用 |
| Evidence 原子写与恢复 | verified | SQLite trigger/lock 失败无部分 chunks；显式 retry；stale processing、损坏/版本拒绝；新 Node/Harness 进程回读一致 | 重启 |
| 三个真实 DSH 只读 tools | verified | tests/course-tools.test.ts；packed profile 中 standard Agent-scoped dispatch + canonical output + grounding assembly | Agent retrieval |
| Grounded QA 的工具与引用路径 | verified | course_search → course_read → citation 逐一映射；instruction-like fixture 保持不可信数据，学习 DB 不变 | 证据问答基础 |
| 真实 LLM 数学/抗注入语义 | planned | NOT RUN：本机无模型凭证，不能把 deterministic/policy tests 称为真实 Agent semantic 验收 | LLM 回答 |
| PDF / MinerU / OpenFile | deferred | TXT/MD 已足够闭环；OpenFile strict-peer probe 不通过，P4 未改变此结论 | 后续导入 |
| Grounded outline / DAG / unknown 初始化 | verified | tests/authoring.test.ts：合法发布、循环/未知先修/跨课/无证据拒绝、语义重试/并发单赢家 | 概念提案 |
| 初始 StudyPlan | verified | 1..14 天、预算/任务上限、pending/v1 派生；不同重发冲突，v2 后重试仍返回原 v1 | 计划提案 |
| Grounded quiz / key 隔离 | verified | 5 题真实来源、concept/evidence/key/重复 prompt/options 校验；同内容/满容量 retry；public result/API 无 key | Quiz 提案 |
| 七个正式 Agent tools | verified | tests/learning-tools.test.ts：真实 DSL/canonical output、四读三写、signal、拒绝内部 mutation；单 grounding section | Agent authoring |
| P1+P2+P3 backend 闭环 | verified | demo:authoring、packed Harness Agent 发布 + HTTP submit + 新进程恢复/重试；weak/review/v2/20min/3题 | backend 全程 |
| Authoring 失败与边界 | verified | SQLite 锁无部分写、真实队列中取消、100 distinct chunks/单 Concept 八大片段/200 quizzes 等边界 | retry/recovery |
| Student read models | verified | tests/student.test.ts：dashboard/quiz listing/result、未提交 key 隔离、已提交反馈、authenticated/wrong-course | Web 数据 |
| 原生 Learning client / 课程设置 | verified | scripts/browser-smoke.mjs：packed client discovery、header/空会话入口、选课/创建/文件选择/Ready/dedupe；composer 预填 | 开始学习 |
| 交互 Quiz / 反馈 / 刷新 | verified | 实际 Chromium 选项点击与键盘、3/5 反馈、响应丢失后相同提交身份与 receipt、刷新恢复 | 学生作答 |
| Progress / Plan / Why changed | verified | 浏览器两错→Weak→v2，显示两条真实错误证据与 Day 2 的 20 分钟/3 题 | 核心演示画面 |
| 普通 UI 答案隔离 / replay | verified | public payload、DOM、真实 quiz_publish card 的 correctOption=2/秘密 explanation 不泄漏；tests/client 覆盖 pending/error/坏结果；原始 session/export 不在边界内 | 提交前 |
| Client 失败与取消 | verified | 创建明确拒绝后可编辑；source/dashboard/submit 失败可重试；旧课程延迟响应不污染新课程；12 秒 timeout/abort model tests | 恢复 |
| 视觉与响应式 | verified | 1440/1024/390 截图人工自审、light/dark、长中英文知识点无横向溢出；1024 使用原生全屏，390 自动全屏 | 学生体验 |
| pinned Docker delivery | planned | P5 | cold boot |
