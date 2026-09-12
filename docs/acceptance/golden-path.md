# Golden path

完整课程验收（planned）：打开 Learning Helper → 创建课程 → 上传小型资料并完成解析 → Agent 提议 outline → 输入 3 天/每天 60 分钟 → 生成计划 → 询问“为什么闭区间上的连续函数一定一致连续？” → 根据资料回答并附 citation/excerpt → 生成并打开 Day 1 的 5 题 quiz → 故意错两道一致连续 → 提交 → 确定性评分 → 持久化 Attempts → weak → ReviewQueue → replan → Day 2 新计划 → UI 解释两道错题如何导致 20 分钟复习 + 3 题。Day 3 mock 为 optional。

P1 确定性子路径：固定 5 题 fixture，Uniform Continuity 两错；assert weak、队列 concept/evidence、oldVersion=1/newVersion=2、Day 2 review 20min / practice 3 题、预算不超过 60；相同提交重试无重复，SQLite 重新打开后所有状态仍在。它不证明上传、Agent 推理或浏览器交互。

P2 Golden Evidence Path（确定性/工具层已验证）：

1. authenticated POST courses 创建空 Course，state.plan=null。
2. 导入 `demo/math-analysis/lecture-03.md`；Source ready、chunks 持久化，同内容重导去重。
3. Agent 的 course_list 返回课程；course_search 查询“一致连续”或“Heine Cantor”，course_read 读取相关 chunk。
4. read 同时返回真实全文、citationLabel 与 learning-evidence machine reference，label 包含真实 section/line，不编造 page。确定性验收将引用与已读 chunks 一一比对。
5. 新 Harness 进程再次读取，全文/locator/引用相同；P1 学习 fixture 同时保持通过。

证据：`tests/course-tools.test.ts` 真正通过 DSH ToolRuntime 执行三工具，policy-level injection 测试确认 source 不进入系统 section；`scripts/harness-smoke.mjs` 从 prebuilt tgz 安装后经 standard preset 真实 Agent 的作用域 registry dispatch 和 grounding assembly 复验，并重启双 DB。它们不等于 LLM 自主选择工具或数学回答质量证明。

真实 LLM semantic acceptance（未运行：无模型凭证）：在安装本插件的 Harness 会话问“为什么闭区间上的连续函数一定一致连续？”。记录 provider/model（不记录 key）、实际 tool call 次序与已读 canonicalRef。检查假设闭区间+连续、结论一致连续、证明有效、直觉与证明区分、每个课程 citation 均来自该次 read，不能虚构页码。再导入 injection.txt，确认无删除行为、仍使用 citations；资料不足的问题必须明确一般知识与课程证据的区别。
