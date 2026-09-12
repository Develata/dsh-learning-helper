# 本地开发

Node/pnpm 基线见 [COMPATIBILITY](../../COMPATIBILITY.md)。插件可独立于 Harness checkout 开发：

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test
pnpm demo
pnpm run build
pnpm pack --pack-destination artifacts
codegraph sync
```

`pnpm demo` 使用真实 Harness storage-domain/SQLite 包，在临时目录执行固定 5 题提交并显示 Day 2 变更；退出清理 fixture 数据。`pnpm test` 包含 body 10 秒超时测试，总时长通常约 11 秒；它不调用 LLM。

`pnpm-workspace.yaml` 只允许确切 esbuild 版本的安装脚本，供 tsx 使用；其余没有统一开放。所有 npm 依赖固定版本，无 workspace/file/link sibling 依赖。

Harness 自身在其 checkout 执行 `pnpm install --frozen-lockfile`、`pnpm run build`。集成操作见 [harness-integration](harness-integration.md)。`.codegraph/`、node_modules、dist、artifacts、.env 不提交；代码变化后 sync 索引，不能提交 graph DB。
