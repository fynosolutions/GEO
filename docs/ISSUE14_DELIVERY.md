# Issue #14：六店 Google / Yelp 评论采集交付

## 结果

六家指定 Manhattan 门店的 Google、Yelp 评论采集完成，共 2,125 条记录。每店输出一份 JSON，包含两条平台记录；每个平台最多取最新 200 条，不足 200 条保留实际数量。

| 门店 | Google | Yelp |
| --- | ---: | ---: |
| Easy Joy Dim Sum & AYCE Hot Pot | 200 | 84 |
| LaoJie Hotpot | 200 | 200 |
| 99 Favor Taste | 200 | 200 |
| The Dolar Shop Hot Pot | 200 | 200 |
| Shoo Loong Kan Hot Pot 小龙坎 | 200 | 41 |
| KPOT Korean BBQ & Hot Pot | 200 | 200 |
| 合计 | 1200 | 925 |

Google 的 1,200 条中有 309 条为无正文评分记录，text 原样保留空字符串、language 为 null；未补造评论。total_reviews 保留平台总数，不用采集数代替。topics 仅使用平台提供的主题词及次数，未提供时为空数组。

## 文件与入口

- [六店样例及输入](../samples/step1-reviews/README.md)
- [数量、抽查与费用核对表](../samples/step1-reviews/核对表.md)
- [36 条独立页面原文核对](../samples/step1-reviews/PAGE_VERIFICATION.md)
- [模块与运行说明](../backend/reviews/README.md)
- [接口契约](API_CONTRACTS.md#review-collection--issue-14)

```sh
npm ci
npm run check
npm run build
npm run collect:reviews -- --stores samples/step1-reviews/stores.json --limit 200
```

上述采集命令会在没有对应缓存时启动付费 Actor，需要配置 APIFY_TOKEN。已有完整缓存的本地复核使用：

```sh
npm run collect:reviews -- --stores samples/step1-reviews/stores.json --cache-only true
BROWSER_CHANNEL=chrome npm test
```

cache-only 模式不会启动 Actor；其他机器没有本地缓存时不会伪造复核结果。使用浏览器的测试需要本机 Chrome 或已安装的 Playwright Chromium。

## 验收证据

- 六店 × 两平台共 12 组完整输出，门店身份以来源名称、地址以及 Google Place ID / Yelp 商户 URL 核实。
- Google 采集参数限制 Google 来源、最新排序、最多 200 条；Yelp 使用专用最新评论 Actor，无日期或语言过滤。评论 ID 用于去重，不按重复正文删除不同评论。
- 每店每平台独立页面抽查 3 条，共 36 条。单条星级全部一致，长评论展开后未见截断；非英文样本核对原文而非页面翻译。
- 已修正 Google 来源的换行编码，使用原始缓存重新导出。全量对照确认 113 条正文只将 `<br>` 形式转换为网页换行，其他文字及字段不变，Yelp 正文不变。36 条抽查原文核对通过。
- Yelp 的 18 条日历日期与纽约当地日期一致。Google 页面仅显示相对时间，已核实与导出时间相容；没有将精确日历日期描述为已独立验证。
- 类型检查、构建、139 项测试全部通过，其中 14 项为评论专项测试。覆盖原文和翻译区分、换行还原、数量上限、排序、ID 去重、错误分店拒绝、失败保留、缓存复用、预算及计费延迟。
- 12 次真实 Actor 运行，每店每平台一次，总费用 US$2.0367，低于 US$5。首轮结果复用，后续修正仅重放缓存，新增费用 US$0。

原始 Actor 数据、运行 ID、账户及逐次费用、页面证据和缓存对照明细保存在本地 .local/issue14，不上传账户信息。公开交付不包含密钥或运行时缓存。本次未改动菜单、商户资料和每周调度的默认行为。
