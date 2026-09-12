# 当前状态

- Current phase：P1 首轮实现进行中。
- Last known good commit：初始空仓 `96ba039fa30ef48f8f5317525cde075daf0ef750`，不是 runnable release。
- What works：两个 checkout 与 CodeGraph 已初始化；Harness 插件边界已审查。
- What is broken：未发现产品回归；尚无业务实现可验收。
- Active decisions：单 package、thin fork、每课程学习聚合原子写、确定性 MCQ。
- Known blockers：无架构阻塞；依赖安装进行中。
- Last verification：git baseline、CodeGraph 1.6.0 init/status；Harness HEAD `c291e7961a515f6d7af9304e7fd1d257929aef26`。
- Next 3 concrete tasks：实现 schema/policy；接入 storage-domain 与 Host；运行独立与真实 Harness 集成检查。
