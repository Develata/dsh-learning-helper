# Agent tools v2

七个工具只使用 exec.agent.session.id 解析 Workspace；没有 course_list，没有 Agent-supplied courseId/projectId/workspaceRoot/workspaceId。Host 单实例注册并由 preset 继承，非 workspace composition；调用直接走 WorkspaceProjects/application services。

| Tool | 输入 | canonical output | Side effect |
|---|---|---|---|
| course_search | query、limit? | projectId/query/results | 无 |
| course_read | chunkIds | projectId/chunks（exact citations + text） | 无 |
| learning_state_get | {} | project、concepts/states/review/currentPlan/recentRevision、setup stage、sources/quiz summaries | 无 |
| course_outline_publish | concepts draft | projectId/concepts | 初始 grounded outline + unknown states |
| study_plan_publish | startsOn/days draft | projectId/plan | 仅初始 v1 |
| quiz_publish | purpose/items draft | projectId/public quiz | 持久化私有 answer key，结果不 echo |
| course_original_read | sourceId/pages/reason | projectId/sourceId/pages（page citation + Harness image attachment） | 按需渲染归档 PDF 1..4页，Host image delivery |

实现 owner：src/tools/workspace-tools.ts；基础 shape 经 defineTool，长度、scope、ownership 与语义由应用严格验证。拒绝显式 scope 字段，不 silently override。exec.signal 一直传递；三个 publish 非 concurrency-safe。没有 workspace 或初始化状态时明确失败，不 fallback。

上表是 **typed canonical value**，不能与 `output.render` 的模型可见摘要混用：

- `learning_state_get`：canonical 保留完整有界状态；render 只列前10份 Source metadata，并另给 sourceCount；Concept 去掉 sourceRefs，ConceptState 只保留 conceptId/status/evidenceCount。
- `course_outline_publish`：render 保留 projectId 与概念 id/name/aliases/prerequisiteIds，不重复 sourceRefs。
- `study_plan_publish`：canonical 仍返回完整 plan；render 返回 projectId/planId/version/startsOn 与 `days[{day,totalMinutes}]`。totalMinutes 由已发布 tasks 求和，不能让模型重述出另一份每日时长。
- `quiz_publish`：canonical 仍返回完整 public quiz；render 仅 projectId/quizId/itemCount/openIn，不重复题目、出处或 key。

学生卡片消费模型回执投影时，同时兼容旧会话的完整 plan/quiz。规则与提交前答案边界见 [Web UI](web-ui.md)。

read 的文本/图片都带 UNTRUSTED 标签。常规上下文只用 active canonical search/read；公式、图像、layout、提取歧义、缺失内容、出处核验才调用 original。原件无法替代 evidence validation 或凭空授权学习 mutation。Vision 路径必须由当前 Harness 模型显式声明 image 支持。

同一 systemPrompt.section 拥有 grounding/authoring policy：普通 QA search/read→精确引用；用户请求学习动作才读取状态→按需 grounded outline/plan/quiz。Source 中的命令和 setup stage 从不授权 mutation。所有 authoring 只用当前项目证据/已验证 Concepts；只读视图不含 key 或全量 Attempt。外部操作次数的提示不是硬保证，实际硬边界见 [Evidence](evidence.md)。

Draft 均为严格 JSON，不接收 Host 所有的 timestamps/status/version/mastery/sourceRefs。Outline：1..100 concepts（id、trim 后非空 name、aliases≤20、prerequisiteIds≤20、evidenceChunkIds 1..8）。Concept ids 唯一；prerequisites 必须在本 outline、无 self/cycle，DAG 检查 O(V+E)。Quiz：purpose、1..20 items（prompt、2..8 options、0-based correctOption、explanation、1..16 conceptIds、1..8 evidenceChunkIds、difficulty）。Host 按位置派生 item ID；拒绝重复 prompt/options。文本字段最多 4000 code units，集合引用必须互异。

每个 concept/item 的 evidenceChunkIds 由 AuthoringService 通过 EvidenceService.read 按课程解析为 canonical sourceRefs。每次 publish 最多解析 100 个不同 chunk，逐片读取（不受 8×4000 大于普通 read 总文本限额的组合影响），不保存全文。Course 必须 active。Outline 发布后固定；plan 需要 outline，quiz 需要 outline + initial plan；所有 concept refs 必须属于当前课程。

Plan draft：合法 startsOn、1..14 连续 days（从 day=1 开始）、每天 1..50 tasks；task 仅 type、conceptIds 1..16、estimatedMinutes 1..240、reason、可选 questionCount 1..20（仅 practice）。每日总时长不得超过 Course.dailyMinutes。Host 派生 plan/task IDs、version=1、createdAt 与 pending status。

幂等按规范化语义：文本 trim，aliases/prerequisites/conceptRefs/evidenceRefs 作为排序集合，outline 按 concept id 排序；days/tasks/items/options 的顺序有意义。相同 outline/initial plan 重试返回既有版本，不同第二份冲突；plan 重试即使已有 v2 仍返回原 v1。Quiz ID 是项目与完整规范化内容的 hash；完全相同内容返回同一 quiz（提交后也不生成可刷分副本），不同内容才是新 quiz，仍受 200/Workspace 上限。重试不需要 generic ledger。

Draft 的 shape/ownership 验证不能证明模型陈述或答案在数学上被资料蕴含；这由 Agent 推理和独立 semantic acceptance 验证。所有 publish 经现有学习写队列串行化，执行前/队列实际提交前检查 AbortSignal；已进入 backend durable write 时取消不保证撤销，使用同一 draft 重试取得结果。答案 key 本来存在于模型生成的 tool call arguments，公开 projection 不 echo key；raw session/debug/export 不属于防作弊边界。

禁止 record_attempt、update_mastery、set_correct、raw_sql、source_db_write；不增加与状态/学生 API 重复的 study_plan_get 或 quiz_result_get。

课程资料不足以支持所请求证明时，说明缺失的定义/定理并停止课程证明。一般知识以独立分区呈现，默认只补充简短背景/直觉；只有用户明确请求独立课外证明才展开，必须说明外部假设与定理，不能把未验证或省略关键构造的论证称为严格证明。

模型输入校验错误提供首个失败字段路径（最长 200 字符）和原因，不返回堆栈或完整输入；例如 `days.0.tasks.0.questionCount`。畸形 chunkIds/evidenceChunkIds 另提示从检索结果原样复制 opaque ID，不截断、计算或生成；publish 参数说明同样明确不使用 bash 修补 ID。不会模糊匹配或自动替换引用，修正后仍经过同课 ownership 校验。任务输入用两个 schema 分支表达：learn/review 不含 questionCount，practice 才可携带 1–20；持久化规则不变。发布后的聊天确认保持简短，学生在 Learning 面板查看结果，课程问答仍必须给出精确引用。

Quiz purpose 按主题描述；只有实际日期与 currentPlan.startsOn 或用户明确选择支持时才关联 Day N，不能因为题目涉及第三天主题就把第三天称为“今天”。

出题前逐题求解，按最终 options 数组的 0-based 下标核对正确选项文本与 explanation；重排后重算下标。每个引用的 chunk 必须实际读取，outline 内出现 ID 不等于读过正文。Domain 校验仍只负责结构和引用，数学正确性不由 schema 保证。

course_search 的模型说明明确现有 lexical contract：只搜正文，空格词为 AND，CJK 为字面 substring；先用一个短主题，语言/同义词分开调用，空结果先缩短词，不能把 filename 与整句一起当语义检索。
