# Golden path

完整课程验收（planned）：打开 Learning Helper → 创建课程 → 上传小型资料并完成解析 → Agent 提议 outline → 输入 3 天/每天 60 分钟 → 生成计划 → 询问“为什么闭区间上的连续函数一定一致连续？” → 根据资料回答并附 citation/excerpt → 生成并打开 Day 1 的 5 题 quiz → 故意错两道一致连续 → 提交 → 确定性评分 → 持久化 Attempts → weak → ReviewQueue → replan → Day 2 新计划 → UI 解释两道错题如何导致 20 分钟复习 + 3 题。Day 3 mock 为 optional。

P1 确定性子路径：固定 5 题 fixture，Uniform Continuity 两错；assert weak、队列 concept/evidence、oldVersion=1/newVersion=2、Day 2 review 20min / practice 3 题、预算不超过 60；相同提交重试无重复，SQLite 重新打开后所有状态仍在。它不证明上传、Agent 推理或浏览器交互。
