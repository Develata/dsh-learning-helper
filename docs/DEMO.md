# 2–3 分钟课程演示

目标：观众看到“昨天的错误改变了今天的学习安排”。先配置模型并完成 [真实验收](operations/real-llm.md)；使用 [原创讲义](../demo/math-analysis/lecture-03.md)。

| 时间 | 学生操作 / 画面 | 讲解 |
|---|---|---|
| 0:00–0:20 | 打开 Harness Web → 学习 | 普通问答通常停在当前问题，错题没有持续影响下一步学习。 |
| 0:20–0:45 | 在专用 Harness Workspace 初始化“数学分析”，考试 +3 天、60 分钟/天；上传 lecture-03.md，显示 Ready | 课程资料决定回答和练习的证据范围。 |
| 0:45–1:10 | 问“为什么闭区间上的连续函数一定一致连续？”；展开 search/read 与引用 | 真实 Agent 先读资料，再解释定义、定理假设和证明。 |
| 1:10–1:35 | 请求“根据资料生成 3 天、每天 60 分钟的计划”；再请求“今天 5 道自测题，至少两题关于一致连续” | Agent 提案，应用层验证课程引用、先修关系和预算。 |
| 1:35–2:05 | 打开练习，故意答错两道一致连续题，提交 | 由已发布 answer key 确定性评分；模型不决定对错。 |
| 2:05–2:30 | 展示 Weak、v2、“为什么计划改变”、20 分钟复习 + 3 题 | 错题成为持久证据，真正修改明日计划。 |
| 2:30–2:50 | 刷新仍有反馈与 v2 | Practice becomes evidence for the next learning action. |

模型等待可以剪辑，保留真实工具调用和最终状态，不能用 fixture 冒充自主 Agent。录制前检查两道错题确实标注同一“一致连续”Concept；答题发生在计划 Day 1。不要录制模型凭证、带 token 的启动终端、raw session/debug 或私有工作路径。

## 安全重置

所有 `pnpm demo*` 命令每次创建新的临时目录，退出只清理本次 fixture。重新运行就是干净状态，不接触日常 DSH_HOME。

Web 录制用专用 Compose project，例如 `docker compose -p learning-helper-demo-20260912 up --build -d`。重置时先 `docker compose -p <本次演示项目名> stop`，再用新的 `learning-helper-demo-<日期序号>` project 启动，分配新 volume，旧资料保留。不要删除默认 learning-helper 数据卷，也不要猜测并删除 SQLite 文件。命令在 fork 的 `deploy/learning-helper/` 执行；同一时间只运行一个发布同一宿主端口（缺省3010）的 project。

录制只需 Quiz、Progress 和 Why changed 等 2–4 个画面。代码图、schema、测试可以在结尾一句说明，不占用主要演示时间。

## v0.2 追加展示（可单独录制）

在同一 Workspace 上传小 PDF，选择本地快速，展示原件已归档、页数与 page citation。若配置了官方 MinerU，则演示长期 Markdown 转换及 active generation；未配置时展示真实 capability gate，不伪造转换成功。切到另一个空 Workspace，面板要求初始化且不显示原资料；切回后学习状态仍在。视觉模式仅在实际模型声明 image 能力时演示。
