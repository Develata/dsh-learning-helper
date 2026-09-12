# Harness 集成

本地采用独立 DSH_HOME 测试 profile，不改用户默认环境。所有命令从完成构建的 Harness checkout 执行：

```bash
DSH_HOME=/tmp/learning-helper-smoke pnpm dsh --profile learning-helper --from-default-profile web --dump-config
DSH_HOME=/tmp/learning-helper-smoke pnpm dsh plugin --profile learning-helper add ../dsh-learning-helper
DSH_HOME=/tmp/learning-helper-smoke pnpm dsh --profile learning-helper --dump-config
DSH_HOME=/tmp/learning-helper-smoke pnpm dsh --profile learning-helper --no-open
```

具体临时路径/端口以本轮验证命令为准，不把本地临时路径提交为发行配置。插件 Host 默认不插入学习 fixture；测试以独立 overlay 显式启用 demo。

bundle 增加学习 Host row 与 SQLite backend，仅将 learning_helper domain 路由 SQLite；profile config 为整值替换，必须保留默认 json backend。独立 custom profile 首次默认只有 base，要明确从 web template 初始化。

最终安装使用 prebuilt tgz；不要依赖 Git source install 在启动时构建。发行锁需记录 exact Harness/Plugin SHA，不能写 main/latest。上游 core patch gate 见根 AGENTS；本轮预期 0。
