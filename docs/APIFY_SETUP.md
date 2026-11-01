# Apify 新路径（2026-11-01）

> 当前版本以 [双版本采集报告](TWO_VERSION_COLLECTION.md) 为准：表格固定显示 10 项多路径值及 10 项独立 apify_ 值；已新增并实测 Yelp 替代 Actor、Uber Eats、DoorDash、Grubhub；OpenTable 已运行但为空，Toast 明确未适配。下文为早期阶段记录。

> 最新展示规则以 [核心字段分析](CORE_FIELDS_ANALYSIS.md) 为准：主表已合并为 7 个语义字段，原始 Apify 键不再逐行铺开；补充项为官网、价格、评论风向。无数据平台默认放入状态区，所有原始属性仍保留。以下早期“尚未配置 Token”和字段展示说明是实施阶段记录，不代表目前真实测试状态；2026-11-01 完整运行已有 Maps 和 Tripadvisor 的 Apify 返回，Yelp 为空。

## 字段精简更新

单条 Apify 字段现在直接显示原始值，移除单元格里的 `record/value` JSON 包装；数字、布尔值和空值保持其意义。数组按列表、对象按原字段名和对应值展示，长列表可展开；多条记录保留原记录序号以区分来源。供应商状态和分店待核实提示统一放到平台表头及来源区，完整原始 JSON 仍可查看和下载。此变更只影响展示，不改变保存数据。

结果页默认仅显示有数据的主要字段。网页主要字段为名称、地址、电话、官网、营业时间、菜系、价格、评分、评论数、评论风向、最近评论日期；全空行自动隐藏。满分、人均、菜单链接和独立状态等低覆盖项放入“Show all fields”视图，不再占据主表。

Apify 默认显示返回结果中的主要商家字段（原始名称、地址、电话、网站/来源链接、时间、分类、价格、评分、数量、评论、评论标签与营业状态）。坐标、图片、内部 ID、抓取元数据等额外字段默认隐藏，可通过同一按钮恢复。

Apify 没有固定字段总数，不同 Actor 和门店不同。页面显示实际下载记录的顶层字段并集数量，每个平台详情也显示各自数量；嵌套评论对象内的属性不重复计入该数字。没有 Token 或真实结果时不能提供真实门店字段数。筛选仅改变展示，完整 JSON 和采集路径保持原样，不丢弃字段；某平台自定义名称未进入主要字段名单时，可在全部字段视图查看。

已接入，但本地尚未配置 APIFY_TOKEN，未验证 Easy Joy 真实返回值。模拟测试成功不代表远端 Actor 可以访问 Yelp。

## 配置

1. 注册 [Apify](https://apify.com/pricing)，可先用 Free 额度测试。到 Console 的 API & Integrations 创建/复制 API Token。
2. 仅在本地 `.env` 增加以下内容，不把 Token 发到聊天或前端：

```dotenv
APIFY_TOKEN=你的Token
APIFY_ENABLED=true
APIFY_CONFIG_FILE=config/apify.json
APIFY_MAX_CHARGE_USD=0.50
```

3. 在项目目录先运行单平台测试：

```powershell
& 'E:\CondaEnvs\geo\node.exe' scripts/probe-apify.mjs yelp
```

可替换为 `tripadvisor`、`google_maps`。如未构建，先运行 `Start-GEO.bat --check`。
该命令不依赖 OpenAI 调用，使用 Easy Joy 的既有门店 URL；返回记录保存在 `.local/apify-easyjoy-*/`。
4. 重启 `Start-GEO.bat` 后，提交新审计。已配置的平台会在原有路径之后额外运行 Apify，即使原有路径已有部分值。

## 字段和页面

不再用 15 字段 schema 筛选 Apify 输出。所有下载到的 dataset 记录和字段，包括对象、数组、数字、布尔、null，保持原 JSON 类型。

- 每个平台额外保存 `<platform>.apify.json`，包含 Actor、run ID、dataset ID、目标分店、状态、采集时间、原始 `items`。
- 合并的 `<platform>.json` 同时包含 `apify`，现有 Download JSON 可完整下载。
- 对比表增加所有 Apify 顶层字段名的并集行，缺失平台为 null。嵌套字段可展开查看，原始字段名不归一化；字段同名也不保证语义一致。
- 来源区提供全部记录的原始 JSON，包含非对象记录。供应商字段不自动写入原来 15 项网页证据值。
- 状态 `unverified` 代表收到供应商数据，尚未确认分店匹配和准确性，不能视为 Yelp 网页成功访问。原来的 blocked 状态与 Apify 有记录可以同时存在。
- 抓取尽量多的字段不等于无限抓取所有评论/照片：Actor 决定可返回字段与评论覆盖。下载最多 10,000 条 dataset 记录；达到上限标记 truncated，原始远程 dataset ID 保留。未使用字段投影删除属性。

## Actor 配置与限制

`config/apify.json` 预置三个候选：Google Maps `compass/crawler-google-places`、Yelp `tri_angle/yelp-scraper`、Tripadvisor `maxcopell/tripadvisor`。Yelp 这个 Actor 主要获取商家信息，不提供完整评论正文。

已通过无需 Token 的公开 build 元数据核对预置输入字段：Yelp 使用 `directUrls` 字符串数组，Tripadvisor 使用 `startUrls` 请求对象数组及 `maxItemsPerQuery`，Google 使用 `searchStringsArray`。这只是 schema 核对，没有启动付费运行，也不能验证站点采集成功。

其余五个平台没有预置未经验证的供应商：在确认具体产品后添加对应配置即可，状态 skipped 表示没配置，不表示平台无数据。

```json
{
  "平台key": {
    "actor": "开发者/Actor名称",
    "input": {"具体Actor要求的输入字段": "{{listing_url}}"}
  }
}
```

支持 `{{listing_url}}`、`{{name}}`、`{{address}}`、`{{website_url}}` 占位符，不改变其余输入类型。各 Actor 的 schema 不同，切换产品必须复制其 Console Input JSON 校正字段；不能只改 Actor 名称。没有发现门店 URL 时，依赖 listing_url 的任务跳过。Google 候选用名称地址搜索，可能返回错误分店，必须核查。

所有响应仍取决于供应商访问能力、套餐、schema、可用额度、地域和语言设置。第三方 JSON 值不一定等于网页显示原文；英文语言选项依 Actor 设置，没有该选项不能承诺英文。不要将返回字段拼成网页原文，也不自动推断人均或全量评论风向。

## 耗时、费用和取消

每次 Actor 远端运行 timeout=180 秒，本地含轮询和下载最多等待约 240 秒。中断会尝试调用远端 abort；失败会记录提醒，应在 Console 检查残留运行。费用可能已产生。

每次调用传入 maxTotalChargeUsd（默认 0.50 美元），其作用取决于 Actor 的计费模型，不能视为账户或整次八平台审计总费用上限。请同时在 Apify 账户配置预算并检查实际计费，免费额度不代表所有产品永久免费。没有自动重复启动失败任务。

官方接口：[启动 Actor](https://docs.apify.com/api/v2/actors-runs-post)、[下载 dataset](https://docs.apify.com/api/v2/dataset-items-get)。
