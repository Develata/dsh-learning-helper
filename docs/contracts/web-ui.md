# Host / Browser contract v1

Host 路由前缀 `/learning-helper/v1`：GET `/health`；GET `/courses/:courseId/state`；GET `/courses/:courseId/quizzes/:quizId`；POST `/courses/:courseId/submissions`，body 为 `{ submissionId, quizId, answers: [{ itemId, selectedOption }] }`。

读取 quiz 不包含 correctOption/explanation；state 不包含私有 quiz keys。提交成功返回 grading receipt、Attempt evidence 与 plan revision；错误 `{ error: { code, message } }`。unknown → 404，冲突 → 409，invalid → 400，limit → 413，storage failure → 503。

每条路由先经公开 `ctx.connection.requestRejection(req)` 校验 Harness 浏览器会话与 Host/Origin；未认证返回 401/unauthorized，来源拒绝返回 403/forbidden。插件不实现独立认证。普通 JSON body 最多 64 KiB，读取最多 10 秒；POST 要求 application/json。提交时间与学习日由 Host 时钟决定，客户端无法提供 correct/mastery。

P4 Client：原生 right sidebar page-type Learning panel，header.actions 提供入口；空会话没有 header 时由 input.left 提供同一入口，不占 corner。课程设置、Plan、Progress、Quiz 共用选中课程；不建立 Session↔Course durable mapping。上传仅 Markdown/TXT（前端 512 KiB 预检，Host 最终验证）。Agent 快捷动作通过 session slot 的 inputActions.setDraft 预填 composer，学生确认发送；Browser 不调用 authoring publish。

Student projection：GET `/courses/:courseId/dashboard` 返回 course、concepts（id/name/prerequisiteIds/status/evidenceCount）、currentPlan、recentPlanRevision、recentRevisionTasks（该次修订新增的 day/task）、recentRevisionEvidence（真实错误 Attempt 的题目/所选选项/概念）与 quiz summaries。GET `/courses/:courseId/quizzes` 返回 `{quizzes}`，仅 id/purpose/createdAt/itemCount/submitted/submittedAt/correctCount。GET `/courses/:courseId/quizzes/:quizId/result` 返回 `{result:null}`（存在但未提交）或提交后逐题 selectedOption/correct/correctOption/explanation 与正确题数；未知课程/quiz 为 404。这些是从一个已提交 snapshot 派生的 read model，不改变 durable schema，不读 Evidence DB。

Quiz 状态：load → answering → submitting → submitted；任何失败显示有限错误与 retry。首次提交冻结 answers + submissionId，超时重试复用同一 payload；不能在未确定结果时换答案或生成新 identity。刷新/重新进入通过 result API 恢复反馈；Host 是真值。课程切换/卸载取消旧请求并忽略过期结果。Browser 请求仅同源 cookie，AbortSignal + 每请求 12 秒 timeout，不保存 token。

普通 student-facing Quiz payload 和 quiz_publish tool card 在提交前不展示 answer key / explanation。专用 keyed tool view 接管 pending/success/error，绝不读 raw args、不提供 Inspect/Raw Input、不 fallback 到 generic raw JSON。原始 session/debug/export 仍可能包含 Agent authoring arguments，不是防作弊安全边界。Card render/replay 纯展示，按钮只导航；实际提交仅来自学生显式操作。Plan card 标明发布当时版本，打开 panel 读取最新计划，避免把旧 tool result 误称 current。

中等宽度下使用 Harness 右上角原生全屏；窄于 768px 由 Harness 自动全屏，插件不实现 drawer 或改全局布局。

UI 使用 Harness tokens/primitives，状态文字与颜色并用；Plan v1→v2 展示实际错误证据和当前任务（20 分钟 review / 3 题）。按 panel open、显式刷新、上传/提交后读取，不高频 polling。验收状态由 acceptance/CURRENT 拥有。

POST `/courses` 接收严格 Course draft（id/title/subject/examAt?/dailyMinutes），返回 201 `{ course }`；GET `/courses` 返回 `{ courses }` 元数据列表，不含私有聚合。setup 课程 GET state 正常返回 `plan: null`。

P2 Source API：POST `/courses/:courseId/sources/text` 接收 `{ filename, mimeType: "text/plain" | "text/markdown", text }`（UTF-8 JSON，不用 base64），返回 201 `{ source, deduplicated: false }` 或重复时 200；GET `/courses/:courseId/sources` 返回 `{ sources }`，包含失败状态以便重导。Source body 独立 4 MiB、10 秒，与 [Evidence content 上限](evidence.md) 分开；断开会取消在途解析。GET `/courses/:courseId/evidence/search?query=...&limit=5` 和 POST `/courses/:courseId/evidence/read`（`{ chunkIds }`）返回同 application canonical output；Agent 本身直接调用 service。没有 Source 删除接口。

quiz_publish 的会话文本现在是 courseId/quizId/itemCount/openIn 摘要；卡片兼容该回执和历史完整 public-quiz JSON，未知/越界值保持安全通用入口。即时 ToolRuntime canonical value 仍保留完整 public quiz。浏览器不能假设 canonical value 会替代会话中的 rendered content。

品牌：三个正式 brand slots 使用 Learning Helper 名称与原创书本标志；注册随 slot declaration / plugin 生命周期清理，priority -10 覆盖官方品牌，不接管导航、模型设置或数据。fork 拥有初始 HTML/title、favicon、Web App manifest 和不支持覆盖的双语产品文案。真实供应商名、技术标识与 OSS 署名不作为产品名称替换。
