# 确定性课程 fixture

`pnpm demo` 在临时 SQLite 中执行真实 storage-domain 闭环，输出 Day 2 变更原因。题目为项目自编，覆盖数列极限、函数极限、连续与一致连续；这里没有上传资料或 LLM 生成行为，不能用作 grounded QA 的验收证据。

固定选项：前三题正确，两道一致连续题错误。数据 owner：`src/presets/math-analysis/demo.ts`；它仅在 Host `demo: true` 时初始化，不覆盖已存在课程。重新练习需要新 quiz，不能删除已有证据来制造效果。
