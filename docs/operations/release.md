# Tag 发布与镜像部署

本页拥有发布操作；产品与模型验收仍由 [CURRENT](../CURRENT.md) 和 [matrix](../acceptance/matrix.md) 记录。Git tag 只触发发布尝试，必须等待对应 Actions 全绿并产生 Release，才能宣称产物可用。

## 两仓顺序

1. 插件更新 package.json 版本，验证后提交；创建 annotated `vX.Y.Z`（预览版本可用 `-rc.N` / `-beta.N` / `-alpha.N`），推送分支和 tag。
2. 插件 workflow 并行执行 tests/typecheck 与 build/demos/pack；二者通过才上传 tgz 和 SHA256SUMS 至 GitHub Release。不发布 npm，不需要 npm token。
3. 运行壳将 versions.lock.json 的 learningHelperPluginSha 固定到插件 tag 对应 commit，更新 compose.release.yml 默认版本，提交并推送同名 annotated tag。其 preflight 检查插件 tag、exact SHA、已发布 tarball 和 base-image lock，一项不符即停止。
4. 运行壳并行执行发布包/部署检查与 image build/Chromium/cold boot/restart。测试镜像通过 Actions artifact 原样交给发布 job，校验 SHA256 与 Docker image ID 后推送 GHCR；不二次编译。
5. 从运行壳 Release 取得 image-digest.txt、固定 digest 的 compose.yml、versions.lock.json、docker-result.json 与 SHA256SUMS。下载并校验，再部署；仓库推送不重启日常实例。

两个新增 workflow 只监听 `push.tags: v[0-9]*`，严格拒绝版本不一致与非版本 ref。普通 push、PR、手动 dispatch 和 release 事件均不触发它们；fork 保留的 upstream 工作流另有自身条件。每个 tag 独立 concurrency group，`cancel-in-progress: false`；不同版本并行且不写 latest/major/minor 浮动镜像别名，避免旧版本抢覆盖。job 有 deadline；中间镜像 artifact 保留 1 天，包和验收诊断保留 7 天，Release 产物长期保留。

Actions 使用截至 2026-09-13 核实的官方最新 release 并固定完整 commit SHA；Node/pnpm 与 Docker lock 一致。构建使用 GHA layer cache，普通回归不访问外部 LLM。写权限只给 publish job，checkout 不持久化凭据，无长期 registry secret。当前仅发布 linux/amd64；未验证 ARM64，不启用 QEMU 矩阵。

## 首次 GHCR 发布

GitHub Container Registry 新包默认私有。首次 workflow 成功后，包管理员打开 `https://github.com/users/Develata/packages/container/learning-helper/settings`，将 visibility 改为 Public；之后可以匿名 docker pull。公开 Git 仓库本身不保证 package 自动公开。若使用私有包，按 GitHub 官方指南使用有 read:packages 的个人凭据通过 `docker login ghcr.io` 登录，凭据不写进 Compose 或仓库。

GHCR 发布由运行壳仓库的 GITHUB_TOKEN 完成，需要该 job 的 packages:write。若已有同名包未关联仓库，管理员需授予 learning-helper 仓库 Actions access；不能靠放宽浏览器认证解决 registry 权限。

## 失败与重试

如果 tag 已存在但 Actions API 的 workflow_runs 仍为0，先核对 tag 对应提交中的 workflow、Actions enabled、tag过滤和推送凭据类型，再查看 Actions 页面限制提示。没有 run 就没有可重跑的 job；保留原 tag，记录时间与 GitHub request ID 供 GitHub 支持排查，不删除重推 tag 或把本地 PASS 当作 Release 成功。后续实际源码修复使用新的补丁版本。

插件发布完成后再 push 运行壳 tag，不能依靠两个独立 workflow 的启动顺序。发布 job 失败时重跑失败 job，可复用同次 run 的已测试 artifact；超过其保留期须重跑完整 workflow。已发布 Release 不覆盖；修正源码/版本锁时发布新的补丁版本与新 tag，禁止移动已存在 tag。镜像 push 和 GitHub Release 不是跨系统事务，前者成功后后者失败会留下镜像，应重试同一次发布并核对 digest，不能当成完整成功。

拉取失败先核对 Actions 与 Release 是否完成，再检查 package visibility/login；无镜像不得退回 latest。容器使用 loopback Host/Origin/cookie 认证和持久化 volume；[README](../../README.md#快速开始) 的 Compose 无 build 字段，运行时不 install/clone/update。升级 v0.1 先执行 [显式迁移](migration-v1.md)。

依据：[GitHub Docker 发布](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images)、[并发控制](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)、[GHCR 权限与可见性](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)、[Docker 测试后推送](https://docs.docker.com/build/ci/github-actions/test-before-push/)。
