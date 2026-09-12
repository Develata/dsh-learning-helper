# Agent tools v1

P2 注册三个只读工具；名称、args、canonical output、render 的可执行定义在 `src/tools/course-tools.ts`，使用 Harness 0.1.5-rc.2 的公开 defineTool 与真实 tools registry。插件启用即在 Host 作用域注册，Agent preset 继承；卸载时 Cordis effect 释放。不经过 localhost HTTP，不延迟初始化存储。

| Tool | 输入 → canonical JSON output | Side effect |
|---|---|---|
| course_list | `{}` → `{ courses: Course[] }`（仅元数据） | 无 |
| course_search | `{ courseId, query, limit? }` → `{ courseId, query, results: EvidenceHit[] }` | 无 |
| course_read | `{ courseId, chunkIds }` → `{ courseId, chunks: EvidenceRead[] }` | 无 |

引用字段与数量/大小上限由 [Evidence](evidence.md) 拥有；tools 的 args 通过严格 Zod contract 再检验（Harness DSL 不表达长度/数值区间，隐式参数根允许额外键），输出由 registry schema 校验。未知课程/引用、额外字段、超限抛稳定 domain error，Harness 转成 isError；底层错误也不伪装成功。三个工具只读且并发安全，timeoutMs=5000，执行检查/传递 exec.signal；SQLite 同步有限操作中无法抢占，边界由课程容量与有限锁等待约束。

output.render 为 JSON 前加 UNTRUSTED COURSE EVIDENCE DATA 标签，元数据和文本同样无 instruction authority；canonical value 不要求模型解析 prose 取 ID。模型可见结果由 Harness tool/result 日志记录。公开输出不包含 quiz answer key 或原始数据库操作。

Grounding policy 由 `src/policy/grounding.ts` 的静态可信文字通过公开 systemPrompt.section 注入，名字 learning-helper-grounding，不替换 Harness core prompt。课程问题先识别课程 → search → read，再引用 read 返回的准确 citationLabel/canonicalRef；不足时明说“上传的课程资料不足以支持这个结论。”，一般知识单独标识。定义/假设/结论/直觉/严格论证分清。该 policy 是模型行为约束，不是对任意模型抗 prompt injection 的形式证明；真实 LLM semantic 验收与确定性 dispatch 证明分开。

P3 仍 planned：learning_state_get、study_plan_get/publish、quiz_publish/result_get、course_outline_publish；其提案需要 concept/source/version 验证。不暴露 record_attempt、update_mastery、set_correct、raw_sql、source_db_write。
