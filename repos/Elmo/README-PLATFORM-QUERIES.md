# Google／Yelp 门店实时查询

首版在「门店资料 → 选择门店 → GEO 试点 → 来源」提供 Google Maps／Yelp 的独立实时查询。现有官网与其他公开页面仍使用 HTML 采集器。新功能仅在本地部署开放，默认关闭，未开通账号不发送外部请求。

## 准备与使用

1. 本机 `restaurant_p1_test` 和 `restaurant_p1` 已于 2026-10-15 完成备份、迁移及数据库验收，详见 `DATABASE-CHANGE-REVIEW.md`。其他新环境仍需先审核迁移、备份、验证隔离库，再在获得明确数据库执行授权后安装；不要直接对其他环境执行迁移。
2. Google：建立 Google Cloud 项目、启用 Places API（New）和结算，创建仅服务端使用并限制为 Places API 的密钥。按真实部署配置 IP 限制。首版使用 Place Details，不调用搜索接口。[接口说明](https://developers.google.com/maps/documentation/places/web-service/place-details)、[计费说明](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing/)。
3. Yelp：开通允许当前评估／展示用途的 Business Details 权限。普通 Places 接入不允许商业分析，试用不能当作商业部署授权；如需内部诊断或监测，先确认适用许可。[Business Details](https://docs.developer.yelp.com/reference/v3_business_info)、[用途及试用说明](https://docs.developer.yelp.com/docs/places-faq)。
4. 参照 `.env.platforms.example`，在根目录 `.env` 与 `apps/web/.env` 配置。Google 启用值必须为 `true`；Yelp 必须指定 `evaluation` 或 `display_authorized`。`BETTER_AUTH_SECRET` 至少 32 个字符，用于签名短期预览凭证。密钥不填入网页或聊天。
5. 确认两平台单次费用上限及此前项目外部支出，填写金额后重启网页。没有可靠费用上限时保持关闭。API 密钥、用途、费用配置均不会自动替你开通服务或订阅套餐。
6. 运行原 `Start-P1.ps1`，管理员进入 GEO 试点，选择平台，输入 Google Place ID，或 Yelp Business ID／alias／完整 `https://www.yelp.com/biz/...` 链接；点击「查询平台信息」。Google 不接受 Maps 短链接作为 Place ID。
7. 对照实际分店核对名称、地址，勾选确认后「确认绑定此分店」。预览凭证十分钟有效且与用户、组织、门店绑定；保存的是 API 返回的规范 ID。普通成员只可查看绑定。

平台实时查询无需启动 GEO worker。官网采集仍需其原有 worker。两平台旧后台任务及周检测被拦截，不自动回退 HTML 抓取；平台 API 数据不进入历史快照、自动比对或 PDF。

浏览器能打开 Google 不代表 Node 后台能直连。如果浏览器依靠本机代理，在两个本机环境文件中配置 `HTTPS_PROXY`、`HTTP_PROXY`，并通过 `NO_PROXY` 排除 `localhost`、`127.0.0.1`、`::1` 和实际本机数据库地址。启动脚本通过 Node 的 `--use-env-proxy` 显式启用代理，需要 Node 24.5 或更高版本；仅在环境文件设置 `NODE_USE_ENV_PROXY` 不能替代启动选项。代理地址应使用维护人确认的已有代理，重启后先无密钥访问 Google 域名根路径检查连通性，不自动重试付费门店查询。[Node 代理配置](https://nodejs.org/api/cli.html#--use-env-proxy)。

## 数据与预算

响应设置 `Cache-Control: no-store, private`；页面不使用查询缓存、浏览器存储或自动刷新。结果在禁用脚本、禁用同源访问的 sandbox iframe 内展示，页面离开／切换门店后清除。服务器原始响应和字段值只在本次请求中处理，不进入持久记录或错误消息。

Google 内容与必要的第三方署名同容器展示；Yelp 门店页不被当成官网，关闭标记不被当成永久停业。常规营业时间和特殊日期分开，未返回字段／日期均显示「未提供」。[Google 存储与署名政策](https://developers.google.com/maps/documentation/places/web-service/policies)。

项目共享预算为 US$20。每次真实请求之前，在数据库事务内获取全项目 advisory lock 并持久化费用上限预留；所有组织、门店和两个平台共用额度。超时、失败、响应无效等结果均不自动退回额度，也不自动重试。预留额是最坏费用估算，不是已核实账单；不能将 API 开销记为零。此前支出包含订阅费用及其他外部服务，需由维护人核对。云平台账户配额也应配置；本机账本不能限制其他程序直接使用同一密钥的支出。

## 验收清单

- 自动模拟验证：字段映射、周日转换、多时段／跨午夜／24h、未知字段、鉴权／限流／超时、响应大小、费用预留、重复提交、预览签名及权限拒绝。
- 网页与官网回归：未开通时显示配置条件、管理员操作限制、平台数据不出现在永久快照／导出中、官网仍正常采集。
- 数据库实测已在原开发机隔离库通过：真实并发锁、不可变触发器、成员／组织／分店隔离及预算记录；外部响应使用合成数据。其他环境仍需审核并明确授权后安装和验证。
- Google 真实单店验收未通过：原开发机已配置凭据并验证代理连通性，真实查询收到接口鉴权拒绝。结算与密钥限制仍待核对；门店字段、人工确认及 ID 绑定尚未验收，不将网络连通或模拟结果记为成功采集。
- Yelp 真实单店待执行：确认用途授权后，用 Easy Joy 门店 alias 查询并核对规范 ID、名称、地址、电话、常规时段。接口无结果不等于店铺不存在。

验收测试使用合成数据，不代表真实店铺资料或真实平台调用成功。

取得接口凭据后，可在本机 PowerShell 执行 `./scripts/configure-platform.ps1 -Platform Google`（或 `-Platform Yelp`）。在隐藏输入提示中粘贴密钥，填写经核对的单次费用上限及此前项目支出。工具备份并同步两个环境文件，不输出密钥、不发起请求；保存后需要重启网页。Google 试点可采用 US$0.05 的保守单次预留上限，实际费用按账户及官方 SKU 结算，不将此数额当作已核实账单。

可重复运行的界面模拟验收：`node scripts/platform-browser.mjs`，使用本机 Edge 和合成接口，截图位于忽略目录 `.restaurant-test/platforms/browser/`。数据库迁移经授权并在隔离库安装后，运行 `node --env-file=.env.p1-test --import tsx --test scripts/platform-db-integration.mts`；该脚本追加明确标记的测试账号、门店和预算事件，替换网络请求为合成响应，不调用平台、不删除历史记录。

## 2026-10-15 本轮验证结果

- 共享库相关测试 44 项、网页单元测试 539 项、配置测试 118 项通过；官网 HTML 解析 3 项通过。
- 本机 Edge 合成界面验收通过：未启用提示、重复点击只查询一次、结果隔离、人工确认绑定、切店清除、Yelp、手机无横向溢出、普通成员无查询按钮；无页面脚本错误。截图均为合成数据。
- 共享库／网页／worker 类型检查、完整 lint、网页生产构建和服务端打包检查通过。构建存在依赖的 `use client` 提示及未配置 Sentry 上传凭据提示，不影响构建完成。
- 迁移快照核对：仅新增 `public.restaurant_geo_records`，无既有表变更或删除，SQL 另附不可变触发器。没有执行迁移、数据库集成脚本或真实平台调用；新增外部 API 费用为 US$0。

后续初始化更新：在用户明确要求初始化后，两个本机专用库已迁移，三组数据库集成验收已通过，工作台原有账号和门店保留。上述“没有执行迁移”属于最初代码交付状态；Google 已配置凭据，但真实接口鉴权及单店验收尚未通过；Yelp 仍待用途授权、密钥配置和真实单店验收。
