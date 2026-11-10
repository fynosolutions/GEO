# Issue #14 实现与测试

## 已完成

- 独立评论 CLI、Google/Yelp 适配、六店输入、分页、去重、最新排序和原文导出。
- 六家店两平台真实采集，共 2125 条；原文、日期和评分与原始 Actor 数据逐项对应。
- 缓存重放不启动新 Actor；已知运行中断后读取原运行，不自动发起付费替代。
- US$5 预算记录包含已结算费用和未结算运行的完整额度；已处理计费事件与费用总额延迟更新。
- 类型检查、构建和 139 项自动测试通过，其中 14 项为评论专项测试。
- 六店两平台共 36 条页面原文对照完成，36 条星级一致，未见正文截断；土耳其语样本已切回原文核对。
- 已修正 113 条 Google 评论的换行编码，缓存重新导出 2,125 条记录，其他字段及 Yelp 正文保持不变；未修改既有每周调度。

## 真实采集结果

| 店 | Google | Yelp |
| --- | ---: | ---: |
| Easy Joy Dim Sum & AYCE Hot Pot | 200 | 84 |
| LaoJie Hotpot | 200 | 200 |
| 99 Favor Taste | 200 | 200 |
| The Dolar Shop Hot Pot | 200 | 200 |
| Shoo Loong Kan Hot Pot 小龙坎 | 200 | 41 |
| KPOT Korean BBQ & Hot Pot | 200 | 200 |

## 验收与交付

- 36 条页面原文及单条评分对照通过，长评论未见截断；初次发现的两条换行差异已修正。
- Yelp 的 18 条日期已按纽约当地日期核实；Google 页面只显示相对时间，与导出时间相容，精确日历日期不作为已独立验证的结果。
- 六份 JSON 已通过全量缓存对照，费用 US$2.0367，修正过程新增费用 US$0。
- 正式交付说明见 [ISSUE14_DELIVERY.md](ISSUE14_DELIVERY.md)。

运行说明见 [reviews README](../backend/reviews/README.md)，交付数据和核对表见 [step1-reviews](../samples/step1-reviews/README.md)。

本次页面核对新增 Apify 运行 0 次、费用 US$0。逐条结果见 [页面原文核对](../samples/step1-reviews/PAGE_VERIFICATION.md)。
