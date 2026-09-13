# ADR-0004 — 计划任务会话使用浏览器书签

状态：接受（用户体验反馈，2026-09-13）。粒度由用户确认：一个计划 task 可建立多个学习会话。

Harness 已拥有会话内容、模型选择、workspace 与消息持久化。插件只编排任务开场请求和导航，不复制 transcript，也不把会话/课程材料塞进学习聚合。当前单用户本地产品使用同源浏览器书签关联 course/plan/task 与 session；外部会话创建与发送分别确认，固定身份支持响应丢失后手动重试。

这允许保持 Learning/Evidence 两平面 ownership 和七工具不变，并通过原生 Session/Remote/slots 实现，无需新增 Harness patch。代价是清除浏览器数据、换浏览器或换 origin 后计划内入口不再可见，真实聊天仍由 Harness 保留；书签明确有限额且不自动删除聊天。未来如需要跨设备课程会话历史，应另行设计 Host 拥有的关联存储与迁移，不能把 localStorage 升格为学习真值。

具体限额、状态和行为由 [Web contract](../contracts/web-ui.md) 拥有。
