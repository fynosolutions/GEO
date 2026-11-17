# GEO 平台分类

本表覆盖 Issue #16 指定的 **21 个平台**和调查补充来源。**粗体**为指定平台。**†** 为三份统计表累计返回 1–9 次的补充来源，仅列在此表备查。三份 JSON 共用 65 个平台，包括 21 个指定平台和累计返回至少 10 次的 44 个补充来源。

| 大类 | 子类 | 平台与来源 | 主要采集字段 |
| --- | --- | --- | --- |
| 口碑 | 综合门店评价 | **Yelp、Tripadvisor、Google 商家资料／地图** | 门店链接、顾客评分、评价数、评价正文和日期 |
| 口碑 | 评分与评价聚合 | **Restaurantji、Restaurant Guru**、PageNearby、umchef、RestaurantJump† | 门店链接、原始评分、评价数、上游来源和摘要 |
| 口碑 | 社区点评与口碑汇总 | **Corner**、Starved.io、taste† | 用户点评、门店排名或评分、外站提及及来源 |
| 第三方 | 地方性网站与社区名录 | **Welcome to Chinatown**、Explore Chinatown、Think!Chinatown、WhereYouEat、BestInHood、Moodap | 门店条目、地址、街区、收录主题和推荐理由 |
| 第三方 | 通用商家目录与餐厅资料 | The Real Yellow Pages、Maskay | 门店条目、地址、联系方式、类别和资料出处 |
| 第三方 | 地点发现、地图清单与旅行规划 | **Atly、Roadtrippers、Wanderlog**、Pearl、EatOutMap | 地点卡片、清单名称、发布者、主题和推荐标签 |
| 第三方 | 餐饮媒体与编辑推荐 | **Eater、The Infatuation、Time Out**、Grub Street、East Table、DiningOut、Serious Eats、Food & Wine、Bon Appétit、Condé Nast Traveler、Find. Eat. Drink.、Tasting Table†、Thrillist† | 文章标题、作者、发布日期、门店提及、推荐理由、编辑评分或名次 |
| 第三方 | 专业评选与餐厅指南 | **The MICHELIN Guide** | 指南条目、评选年份、星级或必比登等荣誉、评审说明 |
| 第三方 | 自助餐与不限量专题指南 | **AYCE Guide、ayce-directory**、All You Can Eat NYC、Buffet Locator | 用餐形式、适用餐段、人均价格、限时和规则 |
| 第三方 | 菜单与价格聚合 | MenuWeb、Menulist、MenuPix、MenuPages、Allmenus、Zmenu、ResMenu†、MenuToEat†、VMbook† | 菜单链接、日期、菜名、规格和原始价格 |
| 第三方 | 优惠、时段特价与消费奖励 | **Happy Hour NYC**、YaY NYC、MealDeals、Eat Around Town (Marriott)、Gofy† | 参与门店、优惠内容、适用时段、有效期和资格条件 |
| 社交 | 论坛与社区讨论 | **Reddit** | 讨论串、社区、发布时间、门店提及、回复和互动数 |
| 社交 | 社交主页、图文与视频 | **Instagram**、Lemon8†、YouTube† | 主页链接、账号、简介、粉丝数、内容中的门店提及和互动数据 |
| 外卖 | 第三方外卖与自取 | **Grubhub、Uber Eats**、DoorDash、Seamless、Fantuan、Beyond Menu | 平台店铺、下单链接、履约方式、接单时间、菜单和价格 |
| 外卖 | 商家直订与托管点餐 | Order.online、Toast / Toast Local、Chowbus、Menufy† | 商家点餐页、服务商、自取或配送方式、接单时段、菜单和价格 |
| 订位 | — | OpenTable、Resy、It’s a Date、SnagRes、Waitlist Wizard、DinnerElite、SevenRooms†、SeatSwiper†、AutoReserve†、ReservationFinder† | 统一登记，按 Issue #16 暂缓核查 |

口碑以门店评分、顾客评价或按门店汇总的社区点评为主要依据。地方性网站共用一个子类。JSON 的 `subclass` 只填写口碑子类。Pearl 的域名暂按 Pearl 地点清单产品对应，原表只有平台列名。

## 交付文件与读数

| 门店 | JSON | 已确认收录 | `false` | 订位暂缓核查 |
| --- | --- | ---: | ---: | ---: |
| Easy Joy | [020.json](020.json) | 22 | 37 | 6 |
| Bao Noodle House | [004.json](004.json) | 9 | 50 | 6 |
| Frydom Express | [001.json](001.json) | 12 | 47 | 6 |

每份 JSON 依据对应门店的 600 题调查表生成。`cited_answers` 统计该店有引用记录的题数，同题多个平台链接只计一次，无引用记录填 `null`。`questions` 提供最多 3 条原始问题。指定平台的 `note` 为空，补充平台填「新增」。

`store_listed: true` 表示通过公开网页或既有匹配记录确认。134 条 `false` 中，9 条有公开目录核查依据，125 条按本次交付口径表示未找到可确认的门店证据。暂缓核查的订位平台填 `null`。

相较于 Issue 初始建议，Corner、Restaurantji 和 Restaurant Guru 按门店点评或评价汇总归入口碑。Reddit 按用户讨论归入社交。Welcome to Chinatown、AYCE Guide 和 ayce-directory 按地区名录或专题指南归入第三方。JSON 使用表中的口碑子类，其他大类的子类仅在本表展示。

[Issue #16](https://github.com/fynosolutions/GEO/issues/16)
