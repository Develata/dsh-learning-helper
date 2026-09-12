# Docs governance

| Owner | 独占语义 | 更新时机 |
|---|---|---|
| constitution | 长期工程约束 | 约束变化 |
| product | 用户、价值、范围 | 产品决定变化 |
| architecture | 系统结构与 ownership | 边界/结构变化 |
| contracts | 精确跨边界义务 | schema/API/行为变化 |
| acceptance | 验收步骤与证据 | 实施或验证后 |
| plan | 顺序、依赖、DoD | 工作安排变化 |
| operations | 命令与故障处置 | 运行方式变化 |
| map | 导航 | 入口变化 |
| ADR | 决策理由 | 持久决策产生；改变时以新 ADR supersede |
| CURRENT | 当前进度 | 每轮重写 |

一个事实一个 owner，以链接引用，禁止复制规则、聊天转储、标题占位和全量 symbol dump。当前没有 generated docs；`.codegraph/` 是本地生成索引，不提交。发现冲突按表确定语义 owner，并同步矛盾处。验收状态只用 planned / implemented / verified；verified 必须关联实际命令与结果。
