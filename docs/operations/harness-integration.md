# Harness 集成

推荐自动验收（插件 checkout）：

```bash
pnpm run test:integration -- /home/deve/gitclone/learning-helper
```

要求该 Harness checkout 已完成 install/build，并满足 [COMPATIBILITY](../../COMPATIBILITY.md) 的 exact upstream 基线约束。检查包括已提交、暂存、未暂存和未跟踪的源文件；只有三份发行说明可与基线不同。修改运行时代码后必须先审查并更新基线，不能绕过检查。

脚本自行 build/pack 插件，经 `dsh plugin add` 安装 tgz 到临时 Web profile，仅为生成后的 profile 添加 pnpm exact version。随后 dump config、启动两个先后独立 Web 进程，验证认证、资源、空 Course/TXT-MD 导入、standard Agent 作用域中七个 tools 的 canonical dispatch、grounding section、outline/plan/quiz 发布、学生提交与双 DB 重启后的幂等恢复。端口由 OS 分配；每条 Git 基线命令最多 10 秒，其他命令最多 120 秒，启动等待最多 45 秒，停止超时 5 秒终止进程组。每个子进程仅保留最近 1,048,576 个日志字符。临时 DSH_HOME 在退出时删除。

`artifacts/integration-result.json` 保存本次 running/passed/failed 状态、时间、upstream/fork/plugin SHA、插件工作区是否有修改与实际 tarball SHA-256；本次失败会替换旧成功记录。默认同时运行实际 Chromium 浏览器：创建/上传/工具卡片/作答/反馈/计划修订/刷新，含失败与响应丢失重试、课程切换、1440/1024/390 与 light/dark。截图和细分结果在 artifacts/browser。它不证明 LLM 自主行为，fixture 通过真实 ToolRuntime 和 Session events 产生卡片。

手动 local-link 开发（已构建的 Harness checkout）：

```bash
DSH_HOME=/tmp/learning-helper-dev pnpm dsh --profile learning-helper --from-default-profile web --dump-config
DSH_HOME=/tmp/learning-helper-dev pnpm dsh plugin --profile learning-helper add ../dsh-learning-helper
DSH_HOME=/tmp/learning-helper-dev pnpm dsh --profile learning-helper --dump-config
DSH_HOME=/tmp/learning-helper-dev pnpm dsh --profile learning-helper --no-open
```

用进程打印的带 token URL 打开浏览器完成 Harness 会话交换；勿将 token 放入文档或日志共享。需要 fixture 时创建自己的 overlay：`- id: learning-helper` 下完整 `config` 同时设置 `demo: true` 与 `evidencePath: !!js dshHomePath('learning-helper', 'evidence.db')`，启动附 `--patch /absolute/path/demo.patch.yml`。默认没有演示课程，已存在 demo 不被覆盖。

bundle 保留默认 json domain backend，只将 learning_helper 路由到 SQLite。storage-domain config 是整值替换，若 profile 有额外 routes，须在最后 overlay 合并完整配置。每对 state.db/evidence.db 只运行一个 Host；锁冲突时保留数据，用原 submissionId 重试，不删数据库排障。

最终课程发行用 prebuilt tgz + exact SHA；Docker/profile 发行锁在 P5 补齐。Git source install 需要 prepare 和执行授权，当前有意不作为部署路径。

Evidence DB 路径由插件 Config.evidencePath 注入，bundle 使用 dshHomePath。不要指向 state.db；未知 schema/损坏会拒绝启动，应先保全原文件并诊断，不删除重建。processing 重启变 failed/interrupted；同内容显式重导会复用身份。若 SQLite 锁导致失败状态也无法写入，解除锁后重导可接管本 Host 已退出的导入。

`tools`/`systemPrompt` 是必需公开服务；bundle 启用四读、三发布工具，无额外 preset patch。自定义 complete system-prompt/preset 可能遮蔽该 section，必须在自己的 composition 中验证实际 assembled prompt。smoke 的临时 test probe 只允许这七个工具的注册检查与 dispatch，并可将确定性 call/result 写入专用测试 session 以验收实际 replay/tool views，不包含在 tarball 或正常 profile。
