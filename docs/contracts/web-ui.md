# Host / Browser contract v1

第一轮 Host 路由前缀 `/learning-helper/v1`：GET `/health`；GET `/courses/:courseId/state`；GET `/courses/:courseId/quizzes/:quizId`；POST `/courses/:courseId/submissions`，body 为 `{ submissionId, quizId, answers: [{ itemId, selectedOption }] }`。

读取 quiz 不包含 correctOption/explanation；state 不包含私有 quiz keys。提交成功返回 grading receipt、Attempt evidence 与 plan revision；错误 `{ error: { code, message } }`。unknown → 404，冲突 → 409，invalid → 400，limit → 413，storage failure → 503。

JSON body 最多 64 KiB，读取最多 10 秒；POST 要求 application/json。带 Origin 请求必须同源，Sec-Fetch-Site cross-site 拒绝；部署沿用 Harness Host 信任边界。提交时间与学习日由 Host 时钟决定，客户端无法提供 correct/mastery。

P4 UI（planned）：Plan / Quiz / Progress / Evidence 四面；MCQ options + Submit + Feedback，重复点击复用 submissionId；loading/error/retry 明确。Plan updated 展示 reason、错误题证据与新旧版本，并标出 20 分钟 review + 3 题。通过 dsh.client/slots/tool views 实现，apps/web patches 目标 0。
