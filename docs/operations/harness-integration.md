# Harness 集成

推荐自动验收（插件 checkout）：

```bash
pnpm run test:integration -- /home/deve/gitclone/learning-helper
```

要求该 Harness checkout 已完成 install/build，并满足 [COMPATIBILITY](../../COMPATIBILITY.md) 的 exact upstream 基线约束。检查包括已提交、暂存、未暂存和未跟踪的源文件；只有三份发行说明可与基线不同。修改运行时代码后必须先审查并更新基线，不能绕过检查。

脚本自行 build/pack 插件，经 `dsh plugin add` 安装 tgz 到临时 Web profile，仅为生成后的 profile 添加 pnpm exact version。随后 dump config、启动两个先后独立 Web 进程，验证认证、资源、确定性提交与重启 receipt。端口由 OS 分配；每条 Git 基线命令最多 10 秒，其他命令最多 120 秒，启动等待最多 45 秒，停止超时 5 秒终止进程组。每个子进程仅保留最近 1,048,576 个日志字符。临时 DSH_HOME 在退出时删除。

`artifacts/integration-result.json` 保存本次 running/passed/failed 状态、时间、upstream/fork/plugin SHA、插件工作区是否有修改与实际 tarball SHA-256；本次失败会替换旧成功记录。它验证 CLI/Host 与 Web 资源加载，不证明浏览器交互或 LLM 行为。

手动 local-link 开发（已构建的 Harness checkout）：

```bash
DSH_HOME=/tmp/learning-helper-dev pnpm dsh --profile learning-helper --from-default-profile web --dump-config
DSH_HOME=/tmp/learning-helper-dev pnpm dsh plugin --profile learning-helper add ../dsh-learning-helper
DSH_HOME=/tmp/learning-helper-dev pnpm dsh --profile learning-helper --dump-config
DSH_HOME=/tmp/learning-helper-dev pnpm dsh --profile learning-helper --no-open
```

用进程打印的带 token URL 打开浏览器完成 Harness 会话交换；勿将 token 放入文档或日志共享。需要 fixture 时创建自己的 overlay：`- id: learning-helper` 下 `config: { demo: true }`，启动附 `--patch /absolute/path/demo.patch.yml`。默认没有演示课程，已存在 demo 不被覆盖。

bundle 保留默认 json domain backend，只将 learning_helper 路由到 SQLite。storage-domain config 是整值替换，若 profile 有额外 routes，须在最后 overlay 合并完整配置。一个学习 DB 只运行一个 Host；锁冲突时保留数据，用原 submissionId 重试，不删数据库排障。

最终课程发行用 prebuilt tgz + exact SHA；Docker/profile 发行锁在 P5 补齐。Git source install 需要 prepare 和执行授权，当前有意不作为部署路径。
