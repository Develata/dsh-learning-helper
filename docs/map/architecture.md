# 入口图

计划落点：`src/index.ts`（bundle Host entry）→ `src/host`（HTTP）→ `src/services`（学习用例）→ `src/policy`（评分与 adaptation）→ `src/domain`（schema）。`src/providers` 将 services 的存储端口接到 Harness。

Harness 查询：DomainFacility / KvTableImpl.update；WebServer.register；defineTool；ClientModuleRegistry；SlotCore.register；AgentPresets。这些 seams 已在审查中用 CodeGraph 定位。后续实现后更新本图的真实 symbol。
