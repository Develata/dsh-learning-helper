# Golden path

课程 Golden path（真实模型与确定性浏览器分别验证，范围见 [final acceptance](final-delivery.md)）：打开 Learning Helper → 创建课程 → 上传小型资料并完成解析 → Agent 提议 outline → 输入 3 天/每天 60 分钟 → 生成计划 → 询问“为什么闭区间上的连续函数一定一致连续？” → 根据资料回答并附 citation/excerpt → 生成并打开 Day 1 的 5 题 quiz → 故意错两道一致连续 → 提交 → 确定性评分 → 持久化 Attempts → weak → ReviewQueue → replan → Day 2 新计划 → UI 解释两道错题如何导致 20 分钟复习 + 3 题。Day 3 mock 为 optional。

P1 确定性子路径：固定 5 题 fixture，Uniform Continuity 两错；assert weak、队列 concept/evidence、oldVersion=1/newVersion=2、Day 2 review 20min / practice 3 题、预算不超过 60；相同提交重试无重复，SQLite 重新打开后所有状态仍在。它不证明上传、Agent 推理或浏览器交互。

P2 Golden Evidence Path（确定性/工具层已验证）：

1. authenticated POST courses 创建空 Course，state.plan=null。
2. 导入 `demo/math-analysis/lecture-03.md`；Source ready、chunks 持久化，同内容重导去重。
3. Agent 的 course_list 返回课程；course_search 查询“一致连续”或“Heine Cantor”，course_read 读取相关 chunk。
4. read 同时返回真实全文、citationLabel 与 learning-evidence machine reference，label 包含真实 section/line，不编造 page。确定性验收将引用与已读 chunks 一一比对。
5. 新 Harness 进程再次读取，全文/locator/引用相同；P1 学习 fixture 同时保持通过。

证据：`tests/course-tools.test.ts` 真正通过 DSH ToolRuntime 执行三工具，policy-level injection 测试确认 source 不进入系统 section；`scripts/harness-smoke.mjs` 从 prebuilt tgz 安装后经 standard preset 真实 Agent 的作用域 registry dispatch 和 grounding assembly 复验，并重启双 DB。它们不等于 LLM 自主选择工具或数学回答质量证明。

P3 Golden Backend Path（确定性与真实工具 dispatch 已验证）：新建空课程 → 导入 lecture-03.md → course_search/read → 发布 Continuity/Uniform Continuity outline 并初始化 unknown → 发布 3 天/60 min 初始 v1 → 发布 5 题 MCQ → public quiz 无 key/explanation → 学生通过现有 Host 提交，前 3 题正确、后 2 题一致连续错误 → weak → ReviewQueue（两条实际 Attempt）→ PlanRevision 1→2 → Day 2 的 20 min review + 3-question practice。重启后 outline、quiz、v2、receipt 均保留；相同发布重试不复制、不重置掌握状态、不覆盖 adaptive plan。

证据：tests/authoring.test.ts、tests/learning-tools.test.ts、pnpm demo:authoring，以及 scripts/harness-smoke.mjs 的 prebuilt tgz + standard preset Agent dispatch + HTTP student submit + 两个真实 Host 进程。fixture draft 是手工确定性输入；它证明 backend 连接，不证明 LLM 自主生成提案。

真实 LLM semantic acceptance（P5 已通过；provider/model、数学检查与观察范围由 final acceptance 拥有）：在安装本插件的 Harness 会话问“为什么闭区间上的连续函数一定一致连续？”。记录 provider/model（不记录 key）、实际 tool call 次序与已读 canonicalRef。检查假设闭区间+连续、结论一致连续、证明有效、直觉与证明区分、每个课程 citation 均来自该次 read，不能虚构页码。再导入 injection.txt，确认无删除或无关发布行为、仍使用 citations；资料不足的问题必须明确一般知识与课程证据的区别。P3 authoring semantic 再要求模型依用户请求自主 search/read → outline → plan → quiz，核对引用、先修顺序、预算、单一正确答案；只问定理时不得自行发布。


P4 Golden Browser Path（确定性 authoring + 实际浏览器已验证）：

1. 启动安装 prebuilt tgz 的 Harness Web；建 session，点“学习”（空会话在 composer，已有对话在 header）。
2. 创建数学分析课程，默认 3 天后考试、60 min/day；用浏览器选择 lecture-03.md，看到 Ready / chunk 数 / 重导去重。
3. 点击生成计划快捷动作，验证官方 composer 已填课程请求；测试用真实 Agent ToolRuntime + Session call/result events 完成 search/read/outline/plan/quiz。没有模型调用，不能称为自主 Agent 行为。
4. 展开实际会话 tool cards，quiz_publish 只显示 5 题已生成与开始入口；公开 Quiz payload 和 DOM 无 correctOption/explanation。
5. 键盘/鼠标作答，故意错两题一致连续；先模拟失败，再模拟 Host 提交成功但响应丢失，重试始终使用同一 submissionId/answers，仍只有五条 Attempt。
6. 看到 3/5 与逐题讲解、Weak、v2，以及 Why changed 的两条证据、20 分钟复习/3 题。刷新页面后通过 Host 恢复反馈/当前计划。
7. 模拟 source/dashboard 失败和旧课程延迟响应，验证 retry/隔离。1440、1024（原生手动全屏）、390（原生自动全屏）检查截图、light/dark、长概念名、横向溢出与页面异常。

证据：tests/student.test.ts、tests/client、scripts/browser-smoke.mjs，由 test:integration 默认执行。artifacts/browser 保存最近运行状态与本地截图，不入 Git。中等宽度下 Harness 默认三栏会压缩聊天，可用其原生全屏或收起左栏；插件提示全屏，不接管全局布局。Quiz 当前以普通文本显示，长篇数学讲解仍交给 Harness chat renderer；citation deep-link 非本阶段验收项。
