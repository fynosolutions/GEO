# GEO 核心字段与 Apify 实际覆盖分析

日期：2026-11-01。依据最新完整审计 `10582e27-c770-4362-bd1b-17b70bf11ff3`，输入 Easy Joy 官网，分店为 145 Mulberry St, New York, NY 10013。门店分析只读取已保存记录，未重新付费采集 Easy Joy；回归测试的误触发与费用另见文末验证记录。

## 一、实际能力：供应商返回数据，不等于所有站点均已解决

| 平台 | Apify 本次结果 | 其它路径与最终情况 |
| --- | --- | --- |
| Google Maps | 返回 1 条商家记录，61 个顶层字段；核心 7 项均有值 | 网页/视觉也取得部分字段。Apify 包含完整周时间、分类数组、电话、评分与数量；无实际评论正文，不能据标签或商家描述总结整体口碑 |
| Tripadvisor | 返回 1 条商家记录，52 个顶层字段；核心 7 项均有值 | 搜索摘要可补部分文字。官网链接与输入官网不同，应如实保留；评论标签不等于评论正文 |
| Yelp | Actor 运行后返回空集合（empty） | 其他路径仍 blocked；当前没有可展示商家字段。空集合不证明 Yelp 没有该门店 |
| OpenTable | skipped，未配置 Actor | 未找到可验证门店；不能宣称 Apify 抓取失败或平台没有门店 |
| Uber Eats | skipped，未配置 Actor | 原有网页工具取得 6 项核心字段，缺电话；浏览器访问受限。不能将原有路径的数据归功于 Apify |
| DoorDash | skipped，未配置 Actor | 原有工具取得名称、街道地址、时间、菜系；未取得评分和数量 |
| Toast | skipped，未配置 Actor | 最新为 OpenAI UND_ERR_CONNECT_TIMEOUT，不能当作 Toast 反机器人证据；历史有异地门店候选，不得填入目标店 |
| Grubhub | skipped，未配置 Actor | 最新为 OpenAI UND_ERR_CONNECT_TIMEOUT；历史记录曾取得索引摘要，不能用旧值冒充本次读取，也不能认定永久无法采集 |

Apify 当前实证是“2 个平台有返回、1 个为空、5 个尚未接入”，不是“八个平台均成功”。现有配置没有为了写报告自动增加其它付费 Actor。返回状态 unverified 表示供应商记录尚需核对分店和准确性，不升级为已核实网页证据。

## 二、为什么原表混乱

原表直接将 Actor 输出字段并集逐行显示，因此 `name/title`、`rating/totalScore/aggregatedRating`、`reviewCount/reviewsCount/numberOfReviews`、`website/official_website` 等概念重复。同一个平台还同时存在网页和 Apify 两组行。

61 或 52 是实际记录的顶层属性数，并不等于有效 GEO 字段数，其中有图片、地理编码、内部 ID、酒店字段、抓取元数据、大量 null 和空数组。不能以“返回字段多”衡量对比价值。

## 三、最终主表：7 个核心字段

以下覆盖数按最新记录中有核心数据的 4 个第三方平台（Maps、Tripadvisor、Uber Eats、DoorDash）计算，不含官网。括号为全部 8 个目标平台的覆盖数。只代表本店本次样本，不是平台普遍成功率。

| 统一字段 | 展示名称 | 同义字段示例 | 本次覆盖 | 选择原因 |
| --- | --- | --- | --- | --- |
| name | 门店名称 | name / title | 4/4（4/8） | 识别实体、检查同名与品牌名称差异 |
| address | 地址 | address / fullAddress / addressObj | 4/4（4/8） | 确认同一分店，是本地发现与跨平台一致性核对的核心；不补齐 DoorDash 缺失的城市邮编 |
| phone | 电话 | phone / phoneUnformatted | 2/4（2/8） | 虽然覆盖稍低，但与名称、地址构成可核对的门店联系方式；对 Maps、Tripadvisor 均有价值 |
| opening_hours | 营业时间 | openingHours / hours | 4/4（4/8） | 直接影响用户是否可到店/下单；保留堂食、外卖、自取与部分时间表达差异 |
| cuisines | 菜系/分类 | cuisines / cuisine / categories / categoryName | 4/4（4/8） | 判断门店与餐饮需求是否相关；不把通用 type=RESTAURANT 当成具体菜系 |
| rating | 评分 | rating / totalScore / aggregatedRating | 3/4（3/8） | 提供来源内的口碑线索；不跨平台计算平均分，不推断满分 |
| review_count | 评分/评论数量 | reviewCount / reviewsCount / numberOfReviews | 3/4（3/8） | 让评分有样本规模背景；保留 Ratings 与 Reviews 原始口径差异 |

主表只统一字段的语义位置，不翻译、不改写原始值。数字仍为数字，字符串保留标点和单位，数组不强行拼成标准文本。不同字段无法精确等价时，不做强制映射。

## 四、补充字段与退出主表的字段

补充按钮只显示以下有数据的项目，不恢复上百行供应商元数据：

| 项目 | 覆盖（4 个可用第三方平台） | 处理及理由 |
| --- | --- | --- |
| official_website | 2/4 | 补充。可核查实体链接，但外卖平台不普遍展示；平台 listing URL 不能充当商家官网 |
| price_range | 1/4 | 补充。适合预算判断，但本次覆盖低；不能从单菜价格或促销文案推断人均 |
| review_themes | 1/4 | 补充。仅保留有实际评论证据的现有结果；该样本只有单条反馈，不能称为整体趋势。Apify reviewTags 不映射为评论风向 |

人均 average_spend、最近评论日期 latest_review_date、菜单链接 menu_url 本次均为 0；评分满分 rating_max 仅 Tripadvisor 有值。这四项退出常规对比，历史值仅留原始 JSON/证据。不能通过假设满分 5、推算人均或把商家回复日期当最新评论来填空。

business_status 退出主表，因为“Closed now”“Delivery unavailable”“永久停业 false”语义不同且时效很短。照片、排名、坐标、联系方式分解、internal ID、评论直方图、商家认领等也只留原始下载，不作为跨平台必填项。

此轮优化主要是对比展示与语义映射。为兼容历史记录，采集器原有 JSON schema 和历史原始属性不被删除；退出主表不等于抹去原始证据。

## 五、页面行为与来源选择

- 每个概念只有一行，不再分成“网页评分”“Apify totalScore”“Apify rating”等重复行。
- 默认只显示有核心数据的平台，Yelp 等无数据的平台移到始终可见的状态列表；可点击 Show unavailable platforms 恢复列。
- 完全无数据的字段行隐藏；个别缺值用 `—` 显示，含义仍为未采集，原始 JSON 保留 null。
- 每行标注当前显示平台中的覆盖数，不能把隐藏失败的平台当成成功；页面同时提示隐藏数量。
- 只有一条商家对象记录时才允许映射 Apify 字段；多条候选不自动合并，留在来源区供核查，避免串店。
- 优先显示 Apify 对应值并标注原字段名、来源和分店待核实；如果网页路径也有不同值，放入同格 Other path value，不覆盖或丢失。
- 仅外观相同的字符串/数字去重，例如 4.8 和字符串 "4.8" 不重复展开；主值类型不改变。不同文本格式不强行判定相同。
- hours.weekRanges 是带数字的周时间结构时，若已有网页原始时间文本，优先显示该文本；不猜测数组索引对应星期。完整 provider 结构可在其它路径值和原始 JSON 查看。
- 不改变任何历史 JSON；更新前端后已有记录直接使用新展示规则，无需重新付费采集。

## 六、准确性与下一步

该方案解决的是对比重复和大量空值，不会让 Yelp 空集合变成成功，也不会宣称未配置的五个平台已经得到 Apify 支持。实际可用字段、分店正确性、原始时效仍需按来源核对。若要扩大 Apify 覆盖，应逐个平台选择 Actor、实测 Easy Joy、检查对应字段及费用，再接入。

验证记录：首次回归测试意外继承本地 Apify Token，启动了 3 个模拟门店远端任务，均已结束，API 记录费用合计约 $0.0094。已为审计模拟测试显式设置 APIFY_ENABLED=false；上述门店分析不使用这些测试数据，历史 Easy Joy 记录未改写。
