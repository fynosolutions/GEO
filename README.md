# GEO — 餐厅 GEO 项目

fynosolutions 内部开发项目。2026-10-15 上传当前源码快照，包含餐厅资料工作台、官网检查组件、浏览器采集器及项目方案。

## 当前状态

P1 门店、证据、事实确认版本和导出已在原开发机验证。GEO 扩展迁移已提供，并在原开发机的隔离测试库和工作台库完成初始化及数据库验收；其他环境仍需审核、备份并明确授权后安装。新增 Google／Yelp 官方 API 专用采集器及网页实时查询，模拟验证已通过；Google 真实查询仍受接口鉴权阻挡，Yelp 用途授权及凭据尚未就绪。完整采集、比对、报告与复测闭环尚未验收，真实 AI 账号探针及 166 条查询仍待执行。本仓库不是完成部署验收的产品。

## 目录

| 路径 | 内容 |
| --- | --- |
| `repos/Elmo` | Elmo 主工作台及餐厅 P1/GEO 试点改造，含已有迁移和锁文件 |
| `repos/geo-optimizer-skill` | 官网检查组件 |
| `restaurant-collector` | Google Maps 半自动 Chrome 扩展、独立餐厅采集脚本、JSON 导入和测试 |
| `p0-browser` | 独立浏览器采集器、测试和锁文件 |
| `windows` | Windows 本机配置、启动和交接说明 |
| `mac` | macOS 本机配置、启动和交接说明 |
| `docs` | 项目方案、实测报告、演讲稿和思维导图 |
| `MANIFEST.json` | 上传时源码版本和文件 SHA-256 清单 |

## 开始使用

- Windows：阅读 [交接说明](windows/README.txt)。
- macOS：阅读 [交接说明](mac/README.txt)。
- 当前功能与待办：[GEO 试点说明](repos/Elmo/README-GEO-PILOT.md)、[P1 说明](repos/Elmo/README-P1.md)。
- Google／Yelp 开通、配置与验收：[平台实时查询说明](repos/Elmo/README-PLATFORM-QUERIES.md)。
- 浏览器采集：[P0 说明](p0-browser/README.md)。
- 餐厅资料采集：[组件入口](restaurant-collector/README.md)、[Chrome 扩展使用说明](restaurant-collector/extensions/google-maps-collector/README.md)、[脚本检索限制与方案选择](restaurant-collector/SCRIPT_LIMITATIONS.md)。

需要 Node.js 24、各项目锁定版本的 pnpm、PostgreSQL；官网检查另需 Python。克隆后自行安装依赖、配置本机数据库与密钥。Windows/macOS 的全新机器安装验收尚未完成。数据库变更须遵循仓库内的审核说明。

## 源码与数据范围

此仓库保存当前开发源码快照，不含上游 Git 历史。原工作目录和子仓库保持不变。保留原目录层级，使组件间的相对路径继续有效。

未上传 API 密钥、真实环境配置、登录 Cookie、浏览器档案、数据库及备份、依赖目录、原始运行证据或重复下载的参考仓库。示例环境配置、测试夹具，以及已进入项目源码的题库和标记为条件未知的历史观察予以保留。

上游许可证、版权与来源说明保留在各组件中；本仓库未另行授予整体开源许可。

- [Elmo](https://github.com/elmohq/elmo)
- [GEO Optimizer](https://github.com/Auriti-Labs/geo-optimizer-skill)

原项目文档中的本机绝对路径、运行记录与验收状态属于原开发环境，不代表克隆后已完成安装或运行。

`MANIFEST.json` 记录首次源码快照的版本与文件指纹；后续代码变更以 Git 提交和 PR 为准。
