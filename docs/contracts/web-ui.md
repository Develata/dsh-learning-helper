# Host / Browser contract v2

作用域：`/learning-helper/v2/sessions/:sessionId`。Host 每次根据公开 Workspace.sessionIds 解析 canonical root；浏览器只提交 authenticated Session 地址，不提交 courseId、workspaceId 或 path。无有效 Workspace 时 fail closed。用户通过 Harness 工作区导航切换项目，Learning Panel 没有第二个 Course selector。

每条请求先经过公开 `ctx.connection.requestRejection` 的 Host/Origin/cookie 校验。不保存 token，不绕过认证。普通 JSON 64 KiB/10 秒；文本资料 body 单独 4 MiB，实际 UTF-8 512 KiB；PDF 是 application/pdf 流、64 MiB/30 秒、四个并发 upload。错误仅安全 code/message：404 不存在、409 冲突、400 输入错误、413 超限、503 不可用。

| Method / suffix | Body / output |
|---|---|
| GET /project | `{project: manifest|null}` |
| POST /project | 严格 title/subject/dailyMinutes/examAt?；Host 生成稳定 projectId，初始化一个 Workspace |
| GET /dashboard | project、concept/status/evidenceCount、currentPlan、recentPlanRevision、真实 revision tasks/evidence、public quiz summaries |
| GET /sources | Source 状态、page/chunk count、parser、parsing/assetization、独立 quota usage、100份提示 |
| POST /sources/text | filename/mimeType/text；ready 或 deduplicated |
| POST /sources/pdf?filename=…&mode=… | binary PDF；mode 省略时使用 Workspace documentParsing.pdfMode；202 sourceId，Host 承接有界解析，随后读取 sources 状态 |
| GET /config；POST /config | 严格非 secret Workspace 配置；可信 MinerU URL，不能写 token |
| GET /capabilities | 当前会话模型是否明确声明 image 能力 |
| POST /assetize | sourceId/retryUnknown?；202 bounded async continuation，不等待长轮询响应 |
| GET /evidence/search；POST /evidence/read | [Evidence contract](evidence.md)；Agent 在同进程直接调用服务 |
| GET /quizzes；GET /quizzes/:id | public summaries / public quiz；提交前不含 key/explanation |
| GET /quizzes/:id/result | 未提交 `{result:null}`；已提交逐题 selected/correct/key/explanation |
| POST /submissions | submissionId/quizId/answers；冻结答案的幂等 grading receipt |

`/learning-helper/v1/health` 与 `/v2/health` 保留 authenticated health。v1 courses routes 不再注册；不能用旧 HTTP API 遍历全局数据。Dashboard 是从 learning snapshot 派生的只读投影，不扩充 durable schema、不读取 corpus。课题名称、状态不用伪精确 mastery 百分比。

原生 `dsh.client`、right sidebar page-type tab、header.actions/空会话 input.left、typed tool views；不占 corner、不创建 SPA/drawer。初始化→资料→计划/进度/练习，PDF 模式为 auto/local-fast/high-accuracy；视觉不可用时高精度明确禁用。独立 MinerU 选项与 config；PDF 已可用但 assetization failed 时保留证据，提供重试。解析与 assetization 分开显示，避免 local Ready 被误认为视觉解析已完成。100 份 soft warning、200 hard limit。

PDF 选择器默认读取 Workspace documentParsing.pdfMode，配置未就绪前不能上传 PDF。学生本次明确选择可覆盖默认值；刷新 MinerU 设置不重置该选择，也不因单次上传改写 Workspace 默认值。

只在 panel open/显式刷新/上传或提交后拉取。长任务状态 2 秒一次、最长 610 秒；Host 自身的超时不依赖面板。组件切换 Session 后卸载旧请求并忽略迟到响应。所有 browser fetch 使用同源 cookie/AbortSignal，普通 12 秒、binary upload 45 秒。不把 React state 当真值。

Quiz：load → answering → submitting → submitted。第一次提交冻结 answers/submissionId，未知结果后的重试复用 payload；禁止换答案重记账。刷新通过结果 API 恢复。普通 quiz payload、dashboard、DOM 与专用 quiz_publish card 在提交前不展示 key/explanation；card 不读取 raw args，无 Inspect/Raw Input，render/replay 无 Host mutation。原始 session/debug/export 可能保留作者参数，**不是考试防作弊边界**。Plan card 是发布当时的版本，panel 是当前版本；卡片支持精简 planId/version/days/totalMinutes 回执和旧会话的完整 plan，缺失或非法回执只显示安全入口，不虚构天数/时长。

计划任务会话：上方快捷动作仅预填当前 composer，学生确认发送。task 的“新会话”是明确发送授权：从 AI 已生成的任务目标与知识点组成冻结请求，经公开 sessions.create、preset/model selection、SessionFace.prompt、sessions.open。继承当前官方 Workspace；继续学习只导航、不重发、不把进入任务当掌握度提高。一个任务可有多个会话。

书签在同源 localStorage `learning-helper:task-sessions:v2`，projectId/planId/taskId/sessionId/requestId 与 created/prepared/sent 状态；≤100、prompt≤16000字符、总读取≤200万字符。内容由 Harness 持久化。浏览器数据清除或 origin 改变会失去书签入口，但聊天仍在 Harness；v1 书签 key 保留，不当作 v2 作用域授权。创建/发送有30秒界限，响应丢失用同一 identity 重试，迟到回调不得继续导航。

会话创建回执与 Workspace follow 独立到达。归属尚未出现时最多订阅等待5秒，确认同一 Workspace 后才配置/发送/打开；异属或已归档立即拒绝。成功、取消、超时均释放订阅，等待期间用户切换页面也不得被迟到导航夺回焦点。

使用 Harness tokens/primitives；按钮/单选有名字，状态同时用文字，错误/status有语义。1440/1024/390 使用原生 push/fullscreen。三个正式 brand slots 为 Learning Helper，不替换实际 provider/model 技术名。v0.2 不合入独立品牌 fork 的 runtime 变更。

学习内容通过统一 `LearningContent` 显示，调用固定 Harness 的公开 `MarkdownText`（内置 KaTeX/CSS/字体），不另打包数学引擎。覆盖题目、选项、提交后解析、练习标题、知识点、计划说明/错题证据及安全 tool card 文本。支持 `$…$` / `\(…\)` 行内公式、`$$…$$` / `\[…\]` 独立公式；代码中的公式记号保持字面量，错误 TeX 保留可读回退。未加分隔符的普通文字不猜测为数学表达式。仅改变显示，不修改保存的原文、citation、答案或评分。

沿用 Harness 对不可信 Markdown 的 HTML/URL/KaTeX trust 限制：原始 HTML 不执行，TeX 不开启 trusted commands；不接入任意 workspace 文件 opener。长公式仅在内容内横向滚动，不撑宽计划 Grid/选项或手机面板。标签为稳定常量，复用 MarkdownText 的 memoized parse，选择答案不重新解析不变的内容。字体与颜色继承原生主题；题干通过 aria-describedby 关联题组，选项保留原生单选标签与键盘交互。
