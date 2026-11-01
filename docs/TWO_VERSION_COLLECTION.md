# 双版本对比与 Apify 扩展（2026-11-01）

## 结果表

固定保留 10 个语义字段：name、address、phone、opening_hours、cuisines、rating、review_count、official_website、price_range、review_themes。

同一张表分别显示多路径字段和 apify_ 前缀字段，共 20 行。例如 rating 是原有检索/浏览器/视觉路径结果；apify_rating 只来自 Apify，两个版本互不补值。缺失为 —，不再自动拿另一路径补齐。官网没有 Apify 版本，该格显示 —。

原始 JSON、字段名映射和来源仍保留。字段值不翻译或改写；供应商数字不会伪装成网页原文。不推断供应商数值价格档位的美元金额、时间数字的时区或星期索引。Yelp 地址 formatted、Uber Eats addressText、DoorDash restaurant.rating.average/count 与嵌套地址、Grubhub phoneNumber/ratingCount/location.address 等已按本次真实返回结构适配。

## 采集顺序

每个平台先完成已有多路径及必要的 review_themes 查询，保存 `<platform>.multipath.json`；然后调用 Apify，保存 `<platform>.apify.json`。最终 `<platform>.json` 同时包含多路径 values 和独立 apify，供同表对比。不同平台仍有两个并行工作者，不会强制等待八个平台全部完成才启动任一 Apify。

多路径 review_themes 缺失时，使用英文问题询问该门店在该平台的实际评论风向，强制 web_search，再结构化提取。只有实际评论文本、平台引用和有效样本量才接受；星级、商家宣传、标签不算评论证据。可通过 REVIEW_THEMES_FALLBACK=false 关闭，触发时每平台增加两次模型调用。

Apify 如返回真实评论正文，则另用英文提示词从最多 20 条去重正文总结，不联网、不混入多路径结果，并校验引文出现在原文中。Apify 无评论正文则 apify_review_themes 留空，不能复制网页主题。单条反馈不称为总体趋势。所有程序编写的模型指令和问题模板均为英文，目标名称及原始评论可能含来源原语言。

## 原因与修复结果

此前只有三个 Actor 配置，所以其他平台 skipped 不是网站都拒绝 Apify。已查询公开 Store 和 build input schema，加入并实测额外供应商：

| 平台 | 当前 Actor | 实测 |
| --- | --- | --- |
| Google Maps | compass/crawler-google-places | 既有记录成功返回，61 个顶层字段 |
| Tripadvisor | maxcopell/tripadvisor | 既有记录成功返回，52 个顶层字段 |
| Yelp | epctex/yelp-business-api | 新测试返回 1 条记录；旧 tri_angle/yelp-scraper 返回空，不再作为默认 |
| Uber Eats | memo23/uber-eats-scraper | 新测试返回 1 条记录，包含电话、评分、数量、菜单及单条评论正文 |
| DoorDash | memo23/doordash-reviews-cheerio | 新测试返回 1 条嵌套记录，补到了评分 4.5 和数量 10；不是只有顶层 restaurant 这个无用字段 |
| Grubhub | natanielsantos/grubhub-scraper | 新测试返回 1 条记录，有电话、分类、评分、数量、时间结构 |
| OpenTable | s-r/opentable-scraper | 首次完整地址关键词搜索为空；复测店名 + 城市返回加州 Canyon Lake Country Club Bar & Grill，地址不匹配，已标记 location_mismatch 并排除。仍未取得 Easy Joy 的有效记录 |
| Toast | 无已验证 Actor | 已搜索 toasttab、toasttab.com 和餐厅菜单产品，未找到可确认适用的商家信息 Actor，也没有目标店的已核实 Toast 门店 URL。配置明确记录原因并跳过，不冒充采集成功 |

这是 Easy Joy、本次网络/供应商的返回情况，不是所有店铺或未来运行的成功率保证。供应商数据仍需核对。Yelp 本次电话 `(347) 913-0454` 与官网 `(929) 243-6130` 不同，保留差异；Yelp 返回评分 4.5、数量 84 是供应商当次观察，不作实时保证。

## 实测记录与查看

- 新增平台实际返回：`.local/apify-platform-retest-1793531779076/`。
- OpenTable 二次测试及错误分店原始返回：`.local/apify-platform-retest-1793532205405/`，已拒绝该候选；未以其评分、评论或地址填表。
- 可查看的双版本验证快照：`.local/audits/161af11f-1b86-4cbe-8ac0-6c8a8e1c55c6/`。
- 快照多路径值沿用 2026-11-01 18:23（北京时间）原审计，新 Apify 使用各自 collected_at；并非八个平台在同一秒重新完整抓取。快照说明已写入 merchant.note。
- 该快照还实际调用了 Yelp 评论主题查询，返回有限个别反馈；Uber Eats 的 Apify 评论总结使用 1 条正文，明确不代表整体风向。
- 重启服务后可访问 `/results?id=161af11f-1b86-4cbe-8ac0-6c8a8e1c55c6`。新审计会使用新配置，历史审计不自动补跑付费任务。

每次远端 Actor 默认传入 maxTotalChargeUsd=0.50，适用范围取决于计费模型，不是账户总预算。没有无限重试或自动订阅收费产品。真实试运行会消耗 Apify 额度和模型额度。测试套件已显式禁用审计模拟中的 Apify，其他 provider 测试使用假 transport。
