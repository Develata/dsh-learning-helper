# Host / Browser contract v1

Host 路由前缀 `/learning-helper/v1`：GET `/health`；GET `/courses/:courseId/state`；GET `/courses/:courseId/quizzes/:quizId`；POST `/courses/:courseId/submissions`，body 为 `{ submissionId, quizId, answers: [{ itemId, selectedOption }] }`。

读取 quiz 不包含 correctOption/explanation；state 不包含私有 quiz keys。提交成功返回 grading receipt、Attempt evidence 与 plan revision；错误 `{ error: { code, message } }`。unknown → 404，冲突 → 409，invalid → 400，limit → 413，storage failure → 503。

每条路由先经公开 `ctx.connection.requestRejection(req)` 校验 Harness 浏览器会话与 Host/Origin；未认证返回 401/unauthorized，来源拒绝返回 403/forbidden。插件不实现独立认证。普通 JSON body 最多 64 KiB，读取最多 10 秒；POST 要求 application/json。提交时间与学习日由 Host 时钟决定，客户端无法提供 correct/mastery。

P4 UI（planned）：Plan / Quiz / Progress / Evidence 四面；MCQ options + Submit + Feedback，重复点击复用 submissionId；loading/error/retry 明确。Plan updated 展示 reason、错误题证据与新旧版本，并标出 20 分钟 review + 3 题。通过 dsh.client/slots/tool views 实现，apps/web patches 目标 0。

POST `/courses` 接收严格 Course draft（id/title/subject/examAt?/dailyMinutes），返回 201 `{ course }`；GET `/courses` 返回 `{ courses }` 元数据列表，不含私有聚合。setup 课程 GET state 正常返回 `plan: null`。

P2 Source API：POST `/courses/:courseId/sources/text` 接收 `{ filename, mimeType: "text/plain" | "text/markdown", text }`（UTF-8 JSON，不用 base64），返回 201 `{ source, deduplicated: false }` 或重复时 200；GET `/courses/:courseId/sources` 返回 `{ sources }`，包含失败状态以便重导。Source body 独立 4 MiB、10 秒，与 [Evidence content 上限](evidence.md) 分开；断开会取消在途解析。GET `/courses/:courseId/evidence/search?query=...&limit=5` 和 POST `/courses/:courseId/evidence/read`（`{ chunkIds }`）返回同 application canonical output；Agent 本身直接调用 service。没有 Source 删除接口。
