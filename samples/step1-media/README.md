# Issue #15 交付数据

覆盖指定七个来源，以及 Time Out、米其林各一篇，共九条来源记录、105个餐厅/目录/社区条目。JSON和上榜表由同一程序生成，没有手工编辑餐厅行。

| 来源 | 条目 | 介绍原文 | 读取方式 | 数量核对 |
|---|---:|---:|---|---|
| Infatuation 热锅榜单 | 10 | 10 | 用户保存的原站 HTML | 通过 |
| Eater 热锅榜单 | 18 | 0 | 原站 HTML | 通过 |
| Infatuation 热锅目录 | 6 | 0 | 原站 HTML；排除指南卡片 | 通过，末页已核对 |
| Infatuation 点心榜单 | 15 | 0 | 原站 HTML | 通过 |
| Infatuation 自助餐榜单 | 10 | 0 | 原站 HTML | 通过 |
| Eater 自助餐榜单 | 14 | 0 | 原站 HTML | 通过 |
| Reddit 热锅讨论 | 12 | 12 | 用户保存的登录后原站 HTML | 47个评论节点对齐，46个有正文、1个删除节点 |
| Time Out 点心榜单 | 17 | 0 | 原站 HTML | 通过 |
| Michelin 点心推荐 | 3 | 0 | 原站浏览器 DOM | 三张卡片与显示数量一致 |

## 文件

- `articles.json`：严格按 Issue #15 字段生成的九条来源记录。
- `上榜表.md`：六家目标分店的确认榜单、目录收录及同名/其他分店/社区提及。
- `evidence.json`：原始读取时间、用户保存时间、SHA-256、评论覆盖、数量核对与缺失原因。
- `acceptance.json`、`验收报告.md`：完整数据状态及逐来源缺口。
- `cache-manifest.json`：本地输入文件校验值，不含原始 HTML 或登录状态。
- `supplied-texts.template.json`：83条尚缺介绍原文的准确来源、名称和顺序。
- `access-checks.json`：此前直接访问受限及后续用户文件补充证据。

## 验收与已知缺口

九个来源均有记录；八个媒体/目录页面共93条，Reddit有12个不同餐厅提及。Reddit全部46条可读评论已人工核对餐厅提及，未增加新的餐厅；保存文件包含47个唯一评论节点，与页面47一致。删除节点不恢复正文，结论只覆盖保存时的公开可见评论。首次提及决定顺序与原句，因此部分原句可能不同于旧索引。

22条介绍原文已提供，83条仍为null；其他媒体完整介绍未收录，没有用摘要冒充。完整数据状态仍为 complete:false / ready_for_delivery:false / exit 2。按Issue允许null、注明缺口交付，由mentor核验，不宣称介绍原文已全量齐备。

Time Out榜单未给地址，保留null。部分Infatuation日期候选冲突，updated保留null，候选见evidence。米其林简介写四家、实际显示三家，按实际三张卡片输出并保留差异。Reddit地点提示不补造完整地址，不计入确认分店榜单数。目标99 Favor Taste和Dolar Shop分店各有两篇确认媒体榜单及一个目录；其他分店未确认的结果不解释为从未被报道。

## 核验与复现

```sh
npm ci
npm run build
npm run verify:media
BROWSER_CHANNEL=chrome npm test
```

`verify:media`不联网、不调用Apify，检查已交付schema、数量、验收计算及上榜表生成一致性。重新采集与用户页面导入见 `backend/media/README.md`。全新检出不含被忽略的本地HTML缓存；精确重放需相应输入文件，不会伪造缓存。原始页面不上传GitHub，尤其用户登录后保存的HTML可能含账户界面与会话信息。

本项无Apify调用，Apify费用US$0，未触发每周或付费采集任务。

最终最新main基线验证：类型检查、构建、离线样例核验通过；162项测试通过、0项失败（含23项媒体测试）。UI使用本机真实Chrome，BROWSER_CHANNEL=chrome；测试不调用付费采集。
