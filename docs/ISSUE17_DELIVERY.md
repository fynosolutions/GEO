# Issue #17 交付与验收

六家店的 Google Maps 和 Yelp 评论已重新采集；原文件路径保留，新增 review_id、author，平台记录写入指定 store。

| 店 | 平台 | 评论数 | 最新评论（源时间） | 缺编号 | 缺作者 |
|---|---|---|---|---|---|
| 020 | google_maps | 200 | 2026-11-17T20:48:18.809Z | 0 | 0 |
| 020 | yelp | 87 | 2026-11-16T16:18:29Z | 0 | 0 |
| LaoJie Hotpot | google_maps | 200 | 2026-11-10T00:14:24.031Z | 0 | 0 |
| LaoJie Hotpot | yelp | 200 | 2026-11-09T16:54:54Z | 0 | 0 |
| 99 Favor Taste | google_maps | 200 | 2026-11-15T01:19:33.500Z | 0 | 0 |
| 99 Favor Taste | yelp | 200 | 2026-11-12T04:09:43Z | 0 | 0 |
| The Dolar Shop Hot Pot | google_maps | 200 | 2026-11-11T01:32:27.401Z | 0 | 0 |
| The Dolar Shop Hot Pot | yelp | 200 | 2026-11-04T17:35:03Z | 0 | 0 |
| Shoo Loong Kan Hot Pot 小龙坎 | google_maps | 200 | 2026-11-15T22:37:56.024Z | 0 | 0 |
| Shoo Loong Kan Hot Pot 小龙坎 | yelp | 41 | 2026-09-28T23:29:53Z | 0 | 0 |
| KPOT Korean BBQ & Hot Pot | google_maps | 200 | 2026-11-18T05:13:49.249Z | 0 | 0 |
| KPOT Korean BBQ & Hot Pot | yelp | 200 | 2026-11-13T02:00:44Z | 0 | 0 |

## Google 日期核查

- 020：旧接口返回最新 2026-10-19T17:44:54.286Z，本次最新 2026-11-17T20:48:18.809Z；相同编号重合 195 条，其中日期改变 0 条。本次 11 月评论 5 条，其中早于旧采集时间 0 条。
- KPOT Korean BBQ & Hot Pot：旧接口返回最新 2026-10-20T21:05:18.342Z，本次最新 2026-11-18T05:13:49.249Z；相同编号重合 139 条，其中日期改变 0 条。本次 11 月评论 61 条，其中早于旧采集时间 0 条。

旧原始接口返回本身就是10月日期，本地导出没有进行相对日期计算或时区回推。当前新返回有11月评论，按原始值输出。新旧共同编号日期未变时，支持原日期映射正确；不能仅凭旧返回断言平台当时没有新评论。旧精确输入缓存会重复输出旧快照，本次使用独立任务缓存完成真实重抓。

## 小龙坎 Yelp

- 原始评论商家地址与目标地址一致：22 E 13th St, New York, NY 10003。
- 店页：https://www.yelp.com/biz/shoo-loong-kan-new-york-2
- 原先41条评论属于该分店；本次也重新核验商家名、街道地址和规范店铺链接。商户列表的发现阶段只返回Google的Yelp站内搜索页，缺商家名和地址，未定位到Yelp详情；评论采集直接使用已验证的/biz/链接。因此 not_collected 不等于确认店页不存在。本任务不修改商户列表或其他采集模块的结果。

## 编号、作者与费用

- review_id 保留平台原生编号，不用网址或本地哈希代替；同一文件内非空编号唯一。
- author 为公开显示名，不输出用户账户编号、头像、主页、地区或商家回复。显示名不是稳定用户标识，不能单凭同名/异名精确推断独立顾客人数。
- 无编号时写 null 并说明；本批编号和作者均无缺失。
- 任务所有12次远端调用及费用均已核对终态；未超过原Issue的US$5及用户授权的US$10。实际账单和账户/Actor明细只留本地。

## 复核

```sh
npm run check
npm run build
npm run verify:reviews
BROWSER_CHANNEL=chrome npm test
# 本地原始数据逐条重放（需要操作者私有返回）
node scripts/verify-review-samples.mjs samples/step1-reviews .local/issue17
```
