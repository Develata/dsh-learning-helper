# 本地开发

基线见 [COMPATIBILITY](../../COMPATIBILITY.md)。单 package 无 sibling 编译依赖：

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test
pnpm run build
pnpm demo
pnpm demo:evidence
pnpm demo:authoring
pnpm demo:workspace
pnpm demo:pdf
pnpm pack --pack-destination artifacts
codegraph sync
```

前三个 demo 保留 v0.1 学习算法与 storage-domain 回归；workspace demo 从空项目经资料/authoring/答错两题到 Weak/v2；pdf demo 使用真实 PDF.js 生成页码引用。均创建独立临时目录，不读取/删除日常数据、不调用模型。普通 tests 使用真实 SQLite/PDF.js，视觉与 MinerU 采用确定性 fake，不能称为真实外部服务验收。

`pnpm test` 包含 backend 与 client model/API tests。已批准的安装脚本仅限 workspace 配置的确切 esbuild 版本；生产 PDF.js 和所有直接依赖固定版本，传递依赖固定于 lockfile。build 输出 Host、PDF Worker 与 dsh.client，同包 pack。

学生路径：Harness 选择已有本地 Workspace → 打开普通 session → 学习 → 在此 Workspace 初始化项目 → 上传 TXT/Markdown/PDF。快捷动作填入 composer，由学生确认发送；计划任务“新会话”沿用同一 Workspace/model 并自动发送一次。切换 Workspace 自动隔离面板数据，无课程选择器。任务入口为当前 browser origin 的书签，实际 Session 由 Harness 持久化。

每个 Workspace 只允许一个 Host 写入，支持本地 filesystem，不支持 NFS/SMB/同步盘并发访问 SQLite。复制/移动前停止 Host，连同 learning-assets 和整个 .learning-helper 保存；重新在 Harness 注册后身份与引用保持。不要手改活动 DB。

浏览器验收使用固定 Harness 自带 Playwright；必要时在 Harness apps/web 执行 `pnpm exec playwright install chromium --only-shell`。随后运行 [packed integration](harness-integration.md)。真实模型入口与秘密边界见 [real-llm](real-llm.md)；显式旧数据升级见 [migration](migration-v1.md)。.codegraph/node_modules/dist/artifacts/.env/DB 不入 Git。

数学显示与完整学生路径一起验收：`LH_BROWSER_SCREENSHOTS=/tmp/lh-math-browser pnpm run test:integration -- /absolute/path/to/learning-helper`。覆盖真实共享 renderer/字体、四种公式分隔符、错误公式与代码字面量、公式选项点击、提交后解析、计划/知识点/tool card、1440/1024/390 light/dark 布局。环境变量仅指定本地截图与浏览器回执目录，不改变产品运行配置。

故障恢复：中断上传的严格匹配临时文件在下次打开该 Workspace 时回收；generation/原件永不自动删除。若提示 interrupted file publication，先停止 Host、备份目录并检查所指目标的 `.tmp-UUID` 兄弟文件；确认只是不完整暂存后由操作员移出 Workspace 保存，再重试。程序不会不断创建新暂存或静默覆盖未知文件。MinerU 已知 task 可显式恢复，提交结果未知时必须先检查 provider 再确认重试。

容量复现：`pnpm exec tsx scripts/benchmark-evidence.ts` 在独立临时 Workspace 导入200份、约48.4MiB规范化正文，再测英文FTS、三字CJK和两字fallback；最多120秒，无网络调用。2026-09-13 本机测得导入3.38秒，英文20条结果31.6ms、三字无命中0.4ms、两字全扫描无命中98.8ms。这是单机单次fixture测量，不是生产延迟保证；结果上限仍20，正文只经显式read进入模型。
