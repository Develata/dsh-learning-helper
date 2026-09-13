# 当前状态

v0.2 开发分支 `feat/workspace-v02`。全局 review 修复、数学显示、新版录屏及文档整理已按用户授权分批推送 origin；本次同步运行壳版本 pin，未部署日常实例、未打 tag。

发布检查：产品运行文件与已验证的635009c一致，沿用最近151项测试和packed/browser证据；检查出站diff、凭据模式、fast-forward关系和实际远端ref。历史LLM/Docker回执仍按各自范围引用，推送不等于部署或重新验收。

## 版本与发布边界

| 对象 | 最近核实的事实（2026-09-13） |
|---|---|
| 已推送主变更批次 | `0ffef0d` → `766833d`，10个逻辑提交，含数学显示、review修复、录屏与文档 |
| 最近验证的产品运行代码 | `635009c2679ff8e7cb46faf63710aaa4942d55f9`；后续为测试、录制和文档 |
| 当前插件发布引用 | origin/feat/workspace-v02；含本页的收尾提交以Git分支HEAD为准，不在自身写入自引用SHA |
| 运行壳版本 pin | exact plugin SHA由[运行壳版本锁](https://github.com/Develata/learning-helper/blob/feat/workspace-v02/deploy/learning-helper/versions.lock.json)拥有；更新源码pin不表示已构建或替换容器 |
| 已冻结 v0.1.0 / origin/main | `958cf67627736232d06a9eeee70cdcb2c0369248`；未创建v0.2 tag |

Harness 固定版本与依赖风险由 [COMPATIBILITY](../COMPATIBILITY.md) 拥有；`packages/`、`apps/` 相对固定upstream仍为0 diff。远端、运行壳pin、实测镜像与本地HEAD是不同对象。

## 可用能力与证据

Workspace隔离、双库/相对资产、TXT/MD/PDF本地解析、代际切换与历史引用、显式v1迁移、七工具作者闭环、Weak→重排、学生UI/任务会话/数学显示已实现。支持范围见 [product](product.md)，逐项证明见 [matrix](acceptance/matrix.md)。最近review修复了缓存代未激活、PDF默认模式未继承、binary上传超时过短及精简plan回执卡片误显示0天。

| 验证面 | 最近证据 / 限制 |
|---|---|
| 本地回归 | 2026-09-13 typecheck、151/151（129 backend/script +22 client）通过；完整review还通过5个demo与无sibling install/build/test/pack。本轮纯文档未重跑这些检查 |
| packed / 浏览器 | `artifacts/integration-result.json` 为录屏那次5d1f7a4+dirty工作树的build/pack/安装/认证/A-B/重启证明；该run选的是recording分支，不是默认完整browser smoke |
| 全面学生UI检查 | 上轮 `/tmp/lh-review-browser/result.json` 与对应截图覆盖丢包重试、刷新、Workspace、PDF默认/覆盖、卡片、数学/键盘/错误状态及1440/1024/390 light/dark；临时文件不保证长期保留 |
| 仓库演示 | [DEMO](DEMO.md#仓库演示素材)：四张PNG、115秒中文字幕MP4；实际packed Web与fixture作者draft，pageErrors=[]、重启/全片解码/画面检查通过。局部回执在artifacts/demo-v02/recording.json |
| 真实LLM | 2026-09-13 newapi/gpt-5.6-luna的六场景与修复后authoring复验分别有范围；具体JSON/语义状态见 [golden path](acceptance/golden-path.md#真实模型语义验收)。本轮未调用模型 |
| Docker | artifacts/docker-result.json验证的是`aad1263221da277f70ca1d724aff4e83fad29be2`；与此前发布a0fa0c6的184个运行文件等价回执在v02-runtime-equivalence.json。不能据此宣称本批次635009c运行代码已进入镜像 |

上述artifacts回执是本地可覆盖输出，必须核对其中SHA、dirty与模式，不能仅凭同名文件继承旧PASS。容量测量与复现命令只在 [local-dev](operations/local-dev.md) 维护。

## 未验证项与限制

最近外部验收时模型未声明image能力、未配置官方MinerU；真实multimodal/MinerU仍未验证，本轮不重新探测凭据或运行环境。fake provider、普通PDF.js和演示录屏不替代外部服务质量证明。

每个本地Workspace只允许一个Host写入，不支持NFS/SMB/同步盘并发SQLite；不删除历史generation或引用；v1必须offline显式迁移；原始session/debug/export不是考试防作弊边界。精确限额与失败模型见 [Evidence](contracts/evidence.md)、[Persistence](contracts/persistence.md)、[Web UI](contracts/web-ui.md)。

下一步：① 用户审阅已推送的修复与新版演示；② 有image模型/官方MinerU服务时执行相应独立验收；③ 需要更新实例时，先为当前pin重新构建并完成Docker验收，再明确执行部署。v0.1.0保持冻结，不自动打v0.2 tag。
