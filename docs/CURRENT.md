# 当前状态

**v0.2.1 已发布**。两仓 tag-only CI 全部通过，插件包、GHCR镜像及固定digest的Compose已发布；匿名docker pull通过。工作分支为 `feat/workspace-v02`，默认分支与已有tag保持原位，未升级日常实例。

本轮新增发行CI、版本校验与pull-only部署文档；Docker验收暴露并修复任务会话创建回执早于Workspace follow的竞态（`8c18da1`）。使用公开订阅确认归属，5秒deadline、取消清理、异属拒绝及等待期间导航变化均有回归；Harness runtime仍0 patch。

## 发布引用

| 对象 | 已核实的引用 |
|---|---|
| 插件 annotated v0.2.1 | `b63399cae9a647667baa36b44bfb3ad9ead39f84`；[CI](https://github.com/Develata/dsh-learning-helper/actions/runs/34777916261)、[Release](https://github.com/Develata/dsh-learning-helper/releases/tag/v0.2.1) |
| 运行壳 annotated v0.2.1 | `6e057f5c26e1899f6e81bf291a94223b123ddec3`；[CI](https://github.com/Develata/learning-helper/actions/runs/34778266086)、[Release](https://github.com/Develata/learning-helper/releases/tag/v0.2.1) |
| 镜像 | `ghcr.io/develata/learning-helper:0.2.1`，linux/amd64 |
| 镜像 digest | `sha256:9a413606f9c1b15053a98372b279da9fe8d955fe3bb0c3549275eddf6a39f032` |
| 当前开发分支 | 本页为发布后验收记录，branch HEAD由Git拥有；不把后续文档提交冒充tag构建输入 |
| 冻结 v0.1.0 / origin/main | `958cf67627736232d06a9eeee70cdcb2c0369248`；迁移必须offline显式执行 |

Harness固定SHA、Node/pnpm与依赖风险见 [COMPATIBILITY](../COMPATIBILITY.md)。镜像Release的versions.lock.json拥有实际构建输入，harnessForkSha不是包含此lock的metadata commit。

## 验证

| 验证面 | 证据 / 范围 |
|---|---|
| 本地回归 | typecheck、156/156（130 backend/script +26 client）、build、5个demo、pack、diff检查通过 |
| standalone | 无sibling副本的frozen install/typecheck/156 tests/build/pack通过 |
| packed / 浏览器 | 修复后真实Harness安装、A/B、MD/PDF、数学/卡片、作者工具、quiz丢包重试、Weak/v2、任务会话、刷新及重启通过；fixture Agent，不是新LLM验收 |
| 发布包 | 插件CI通过；Release tgz/SHA256SUMS下载校验成功；185个dist文件与本地已测试构建逐一一致 |
| Docker CI | 运行壳CI先构建一次，EXTERNAL模式验收该镜像：coldBoot/browser/restartPersistence/authAndOrigin全部PASS，再原样传给publish；不是声称每次no-cache |
| GHCR / 附件 | 空Docker凭据目录匿名pull完成，digest与Release相同；Compose/versions.lock/docker-result/image-digest全部SHA256校验成功 |
| Harness检查 | 9 deployment tests、16 doc-quick、34 doc-sync、lint与push hook/typecheck通过；packages/apps对固定upstream0 diff |
| 实际模型 | 历史newapi/gpt-5.6-luna六场景及authoring复验的独立范围见 [golden path](acceptance/golden-path.md#真实模型语义验收)；本轮没有调用模型 |

本地artifacts可被后续执行覆盖；远端Release的docker-result.json与image-digest.txt是本次发行的稳定回执。本地从GHCR匿名拉取后的v0.2.1已再次通过独立volume、3012端口的完整Chromium/认证/重启验收，回执为artifacts/docker-result.json；未改动日常3010实例。

## 能力与限制

Workspace隔离、双库/相对资产、TXT/MD/PDF本地解析、代际切换与历史引用、显式v1迁移、七工具作者闭环、Weak→重排、学生UI/任务会话/数学显示已实现。范围与逐项证明见 [product](product.md)、[matrix](acceptance/matrix.md)。[DEMO](DEMO.md#仓库演示素材)包含四张PNG及115秒中文字幕MP4；作者draft是fixture。

真实multimodal/MinerU仍未验证：最近外部验收时模型未声明image能力，未配置官方MinerU。每个本地Workspace只允许一个Host写入；不支持NFS/SMB/同步盘并发SQLite，不删除历史generation；原始session/debug/export不是考试防作弊边界。

v0.2.0首次tag推送未生成Actions run；当时API enabled且用户确认页面无启用/账号限制提示，原因未确定。已有tag保持不变，实际运行缺陷修复后发布的新v0.2.1已全绿，不再是当前阻塞。

下一步：① 按 [README](../README.md#快速开始) 或Release Compose显式部署；② 使用 [DEMO](DEMO.md) 演示当前闭环；③ 只有获得可用服务环境后，单独验收真实vision/MinerU，不将fixture结论扩大为真实服务质量。
