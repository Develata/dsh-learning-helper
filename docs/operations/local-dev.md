# 本地开发

Node 24.18.0、pnpm 11.7.0。插件必须离开 sibling checkout 也能开发：

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test
pnpm run build
pnpm pack --pack-destination artifacts
codegraph sync
```

Harness 单独在其 checkout 执行 `pnpm install --frozen-lockfile`、`pnpm run build`。首次安装/构建较大，保留明确输出与退出状态；不默认全量跑 upstream suite。集成见 [harness-integration](harness-integration.md)。

`.codegraph/`、node_modules、dist、artifacts、.env 不提交。源码里不写凭据；没有模型凭据也应通过 P1 测试。基线 Node/pnpm/Harness SHA 见 [COMPATIBILITY](../../COMPATIBILITY.md)。
