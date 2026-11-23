# GEO 平台分类与单店访问清单

2026-11-20 按会议纪要及用户本轮确认口径，进一步更新 Issue #16 分类结果。2026-11-23 补充各店媒体来源的具体板块名称与路径标注。

## 本次规则

- 「品类专属」适用于独立品类网站，也适用于综合网站中的品类频道、专题指南或榜单。按门店分别判断：020 为火锅／AYCE，004 为面食／汤面／包子，001 为炸鸡／鸡翅／汉堡／快餐。保留大类属性，媒体专题使用「第三方／品类专属」，评价型来源沿用「口碑／品类专属」。
- 同一域名在每店 JSON 中仍只保留一行。The Infatuation 和 Eater 在三店分别标为品类专属，表示该店的品类访问方向，不表示该域名全部内容都专属于该品类。cited_answers 仍为该店全部 600 题的平台引用题数，不改为专题页或品类子集的次数。
- 每份 JSON 只收录该店 600 题统计表实际出现过的平台，按原表列顺序排列。无引用的平台省略，各店清单独立。
- 本轮采用所有正引用记录，包括低于 10 题的来源，以呈现各店完整的访问情况。原 Issue 的固定 21 平台及补充来源门槛由本轮要求替代。达到 10 题的来源可用 cited_answers 筛选。
- cited_answers 是该店引用该平台的题数，每题计一次。questions 从该店的正引用行提取最多 3 个原始英文问题。原表的单题数值为不同 URL 次数，原始 URL 累计数另列在下方统计表。
- note 只使用空字符串或「新增」。原 Issue 21 平台中的来源填空，其余填「新增」。
- store_listed 已全部补齐为布尔值。本轮核查原先为 null 的 50 条记录，3 条确认收录填 true，47 条在多种公开渠道尝试后仍无法确认，按用户要求填 false；既有布尔记录沿用。false 同时包括未查到和访问失败，不能解释为平台已证明没有该店。订位保留且本轮也补齐收录状态，subclass 仍填 null；订位 false 不纳入门店资料缺失判断。

[会议纪要](https://notes.granola.ai/t/b075a026-0038-44ad-8546-383b8564d356-008umkv4) · [Issue #16](https://github.com/fynosolutions/GEO/issues/16)

## 分类与子类

以下为来源目录。每店最终纳入哪些来源，以该店 JSON 和后面的独立清单为准。

| 大类 | 子类 | 来源 | 单店判定 |
| --- | --- | --- | --- |
| 口碑 | 综合门店评价 | **Yelp、Tripadvisor、Google 商家资料／地图** | 按各店正引用记录收录。 |
| 口碑 | 评分与评价聚合 | **Restaurantji、Restaurant Guru**、PageNearby、umchef、RestaurantJump† | 按各店正引用记录收录。 |
| 口碑 | 社区点评与口碑汇总 | **Corner**、Starved.io、taste† | 按各店正引用记录收录。 |
| 第三方 | 地方性网站与社区名录 | **Welcome to Chinatown**、Explore Chinatown、Think!Chinatown、WhereYouEat、BestInHood、Moodap | 按各店正引用记录收录。 |
| 第三方 | 通用商家目录与餐厅资料 | The Real Yellow Pages、Maskay | 按各店正引用记录收录。 |
| 第三方 | 地点发现、地图清单与旅行规划 | **Atly、Roadtrippers、Wanderlog**、Pearl、EatOutMap | 按各店正引用记录收录。 |
| 第三方 | 餐饮媒体与编辑推荐 | **Eater、The Infatuation、Time Out**、Grub Street、East Table、DiningOut、Serious Eats、Food & Wine、Bon Appétit、Condé Nast Traveler、Find. Eat. Drink.、Tasting Table†、Thrillist† | 按各店正引用记录收录。 |
| 第三方 | 专业评选与餐厅指南 | **The MICHELIN Guide** | 按各店正引用记录收录。 |
| 口碑 | 品类专属 | AYCE Guide、All You Can Eat NYC、Buffet Locator | Easy Joy 沿用三个品类来源；Bao 和 Frydom 的 Buffet Locator 仍是泛套餐／性价比参考，不进入其品类专属。 |
| 第三方 | 品类专属 | The Infatuation、Eater 的门店对应品类频道、专题指南与榜单 | 三店分别登记火锅／AYCE、面食、炸鸡／快餐方向；优先于同一域名的通用媒体子类。具体页面和证据边界见下表。 |
| 第三方 | 菜单与价格聚合 | MenuWeb、Menulist、MenuPix、MenuPages、Allmenus、Zmenu、ResMenu†、MenuToEat†、VMbook† | 按各店正引用记录收录。 |
| 第三方 | 优惠、时段特价与消费奖励 | **Happy Hour NYC**、YaY NYC、MealDeals、Eat Around Town (Marriott)、Gofy† | 按各店正引用记录收录。 |
| 社交 | 论坛与社区讨论 | **Reddit** | 按各店正引用记录收录。 |
| 社交 | 社交主页、图文与视频 | **Instagram**、Lemon8†、YouTube† | 按各店正引用记录收录。 |
| 外卖 | 第三方外卖与自取 | **Grubhub、Uber Eats**、DoorDash、Seamless、Fantuan、Beyond Menu | 按各店正引用记录收录。 |
| 外卖 | 商家直订与托管点餐 | Order.online、Toast / Toast Local、Chowbus、Menufy† | 按各店正引用记录收录。 |
| 订位 | — | OpenTable、Resy、It’s a Date、SnagRes、Waitlist Wizard、DinnerElite、SevenRooms†、SeatSwiper†、AutoReserve†、ReservationFinder† | 保留订位来源；按用户最新要求补齐 store_listed。subclass 为 null，false 不纳入门店资料缺失判断。 |


## 三店结果

| 店号 | 门店 | 实际访问平台数 | 新补入平台数 | 订位来源数 | 未填 store_listed 记录 |
| --- | --- | ---: | ---: | ---: | ---: |
| 020 | Easy Joy | 77 | 15 | 10 | 0 |
| 004 | Bao Noodle House | 70 | 14 | 10 | 0 |
| 001 | Frydom Express | 53 | 4 | 6 | 0 |

## 品类专属子类的实际结果

「品类专属」不再要求整站只服务单一品类。独立品类站、综合媒体的品类频道，以及聚焦具体菜品的专题文章／榜单均可纳入；普通地区指南、菜单平台或外卖平台不因出现菜名就自动归入此子类。

| 店号／门店 | 专属品类 | 独立品类网站 | 大网站内对应品类板块／专题 | JSON 分类 |
| --- | --- | --- | --- | --- |
| 020 · Easy Joy | 火锅／AYCE／自助 | AYCE Guide（allyoucaneatguide.com，49 题）、All You Can Eat NYC（allyoucaneat.nyc，13 题）、Buffet Locator（buffetlocator.com，6 题） | The Infatuation：[火锅专题](https://www.theinfatuation.com/new-york/guides/best-hot-pot-nyc)、[AYCE 专题](https://www.theinfatuation.com/new-york/guides/best-all-you-can-eat-new-york)；Eater：[纽约火锅榜单](https://ny.eater.com/maps/best-hot-pot-restaurants-nyc) | 独立来源沿用口碑／品类专属；两家媒体为第三方／品类专属。 |
| 004 · Bao Noodle House | 面食／汤面／包子／饺子 | 当前固定平台统计中尚未识别独立面食专属站 | The Infatuation：[汤面专题](https://www.theinfatuation.com/new-york/guides/best-noodle-soup-nyc)、[饺子专题](https://www.theinfatuation.com/new-york/guides/the-dumpling-map)；Eater：[汤面专题文章](https://ny.eater.com/2023/1/24/23559677/nycs-best-noodle-soup) | 两家媒体均为第三方／品类专属。 |
| 001 · Frydom Express | 炸鸡／鸡翅／汉堡／快餐 | 当前固定平台统计中尚未识别独立炸鸡／快餐专属站 | The Infatuation：[炸鸡频道](https://www.theinfatuation.com/new-york/cuisines/fried-chicken)、[炸鸡榜单](https://www.theinfatuation.com/new-york/guides/best-fried-chicken-nyc)；Eater：[炸鸡榜单](https://ny.eater.com/maps/nyc-fried-chicken-best)、[鸡翅榜单](https://ny.eater.com/maps/best-chicken-wings-nyc) | 两家媒体均为第三方／品类专属；现已核实的专题以炸鸡和鸡翅为主，不将汉堡方向写成已验证板块。 |

### 统计支持与页面证据边界

以上链接在 2026-11-20 通过公开搜索确认存在，作为各门店的品类板块映射；并非从历史 AI 回答中恢复的引用链接，也不表示这些页面已收录目标门店。store_listed 不因板块存在或分类改变而修改；本轮补充核查更新见后文。

原有 600 题已经包含菜品问题。以下仅统计问题正文明确出现目标菜品／品类的子集，004 先剔除店名 Bao Noodle House，避免把店名中的 Noodle 算作菜品问题；每题对每个平台计一次。

| 门店 | 品类相关问题数 | The Infatuation 引用题数 | Eater 引用题数 | 判断 |
| --- | ---: | ---: | ---: | --- |
| 020 · Easy Joy | 166 | 106 | 121 | 包含 hot pot、all-you-can-eat、AYCE、buffet；另有独立 AYCE 来源。 |
| 004 · Bao Noodle House | 110 | 78 | 110 | 包含 noodle(s)、soup、bao、bun(s)、dumpling(s)；已有面食品类访问证据。 |
| 001 · Frydom Express | 224 | 32 | 151 | 包含 fried chicken、wing(s)、burger(s)、fast food／fast-food；已有炸鸡／快餐品类访问证据。 |

三份原始统计表均为同一套 80 个平台列，仅保存问题及每平台返回 URL 的数量，没有原始回答、引用 URL 或页面路径。因此，本轮依据「该店品类问题中的平台引用＋公开存在的相关板块」执行用户确认的分类口径；尚不能逐题确认历史引用是否来自上列页面，亦不能将平台引用总数分配给各具体板块。三个 JSON 中的 questions 已选用该店对该平台有正引用的品类相关原始题目。

### 品类问题举例

- 020 / AYCE Guide
  - Q035 Where can I get hot pot without leaving Chinatown, Manhattan?
  - Q076 Which restaurants in Chinatown, Manhattan serve both hot pot and dim sum?
  - Q103 Which all-you-can-eat restaurants in Chinatown, Manhattan are worth the price?
- 004 / Buffet Locator
  - Q127 Which Chinese restaurants in New York City offer the best value?
  - Q130 Where can I get an affordable Chinese dinner in New York City?
  - Q141 Which Chinese restaurants in New York City have reasonably priced family meals?
- 001 / Buffet Locator
  - Q120 Where can I get a set meal without a long wait in Sunset Park, Brooklyn?

## 各店独立访问清单

媒体来源采用「平台名 — 对应品类板块」标注，域名栏同时列出板块／专题路径，以区分同一网站在三家门店中的品类方向。域名用于平台归并，路径用于说明品类映射；下列路径是已核实存在的对应内容，并非已恢复的历史引用 URL。引用题数及返回 URL 累计数仍为整个平台口径，不是所列板块的单独次数。JSON 的 domain 保持纯域名，不把路径拼入域名或拆成重复的平台记录。

### 020 · Easy Joy

来源工作簿为 EasyJoy_GEO_Statistics.xlsx，共 600 题。

| 来源／对应品类板块 | 域名／对应板块路径 | 大类 | JSON 子类 | 平台引用题数 | 平台返回 URL 累计数 |
| --- | --- | --- | --- | ---: | ---: |
| The Infatuation — 火锅／AYCE 专题 | theinfatuation.com<br>火锅：[/new-york/guides/best-hot-pot-nyc](https://www.theinfatuation.com/new-york/guides/best-hot-pot-nyc)<br>AYCE：[/new-york/guides/best-all-you-can-eat-new-york](https://www.theinfatuation.com/new-york/guides/best-all-you-can-eat-new-york) | 第三方 | 品类专属 | 421 | 869 |
| Eater — 纽约火锅榜单 | ny.eater.com<br>火锅：[/maps/best-hot-pot-restaurants-nyc](https://ny.eater.com/maps/best-hot-pot-restaurants-nyc) | 第三方 | 品类专属 | 539 | 1351 |
| Reddit | reddit.com | 社交 | null | 390 | 1157 |
| Corner | corner.inc | 口碑 | 社区点评与口碑汇总 | 247 | 423 |
| Tripadvisor | tripadvisor.com | 口碑 | 综合门店评价 | 162 | 204 |
| Restaurantji | restaurantji.com | 口碑 | 评分与评价聚合 | 22 | 24 |
| Zmenu | zmenu.com | 第三方 | null | 7 | 7 |
| WhereYouEat | whereyoueat.com | 第三方 | null | 4 | 7 |
| Time Out | timeout.com | 第三方 | null | 220 | 263 |
| Yelp | yelp.com | 口碑 | 综合门店评价 | 3 | 3 |
| OpenTable | opentable.com | 订位 | null | 187 | 300 |
| Resy | resy.com | 订位 | null | 85 | 96 |
| The MICHELIN Guide | guide.michelin.com | 第三方 | null | 178 | 266 |
| Tasting Table | tastingtable.com | 第三方 | null | 1 | 1 |
| Restaurant Guru | restaurantguru.com | 口碑 | 评分与评价聚合 | 6 | 7 |
| MenuPix | menupix.com | 第三方 | null | 6 | 7 |
| Allmenus | allmenus.com | 第三方 | null | 1 | 1 |
| Grubhub | grubhub.com | 外卖 | null | 5 | 5 |
| Seamless | seamless.com | 外卖 | null | 4 | 4 |
| Uber Eats | ubereats.com | 外卖 | null | 25 | 47 |
| DoorDash | doordash.com | 外卖 | null | 7 | 15 |
| Toast / Toast Local | toasttab.com | 外卖 | null | 10 | 10 |
| Beyond Menu | beyondmenu.com | 外卖 | null | 3 | 3 |
| Google Maps | google.com | 口碑 | 综合门店评价 | 1 | 1 |
| YouTube | youtube.com | 社交 | null | 1 | 1 |
| Lemon8 | lemon8-app.com | 社交 | null | 4 | 4 |
| Thrillist | thrillist.com | 第三方 | null | 1 | 1 |
| Happy Hour NYC | happy-hour.nyc | 第三方 | null | 236 | 273 |
| PageNearby | pagenearby.com | 口碑 | 评分与评价聚合 | 35 | 37 |
| Pearl | joinpearl.co | 第三方 | null | 38 | 45 |
| East Table | easttable.com | 第三方 | null | 90 | 90 |
| Atly | atly.com | 第三方 | null | 92 | 172 |
| AutoReserve | autoreserve.com | 订位 | null | 4 | 4 |
| EatOutMap | eatoutmap.com | 第三方 | null | 1 | 1 |
| Wanderlog | wanderlog.com | 第三方 | null | 5 | 5 |
| The Real Yellow Pages | yellowpages.com | 第三方 | null | 4 | 5 |
| Grub Street | grubstreet.com | 第三方 | null | 116 | 119 |
| Starved.io | starved.io | 口碑 | 社区点评与口碑汇总 | 40 | 45 |
| Bon Appétit | bonappetit.com | 第三方 | null | 69 | 69 |
| Food & Wine | foodandwine.com | 第三方 | null | 96 | 100 |
| Serious Eats | seriouseats.com | 第三方 | null | 157 | 157 |
| MenuWeb | menuweb.menu | 第三方 | null | 46 | 50 |
| Order.online | order.online | 外卖 | null | 18 | 27 |
| SevenRooms | sevenrooms.com | 订位 | null | 2 | 2 |
| taste | tastetheapp.com | 口碑 | 社区点评与口碑汇总 | 2 | 2 |
| Fantuan | fantuan.ca | 外卖 | null | 8 | 13 |
| Maskay | maskay.com | 第三方 | null | 58 | 70 |
| SnagRes | snagres.com | 订位 | null | 12 | 14 |
| Waitlist Wizard | waitlistwizard.com | 订位 | null | 8 | 8 |
| SeatSwiper | seatswiper.com | 订位 | null | 2 | 2 |
| Eat Around Town (Marriott) | eataroundtown.marriott.com | 第三方 | null | 37 | 37 |
| Chowbus | chowbus.com | 外卖 | null | 5 | 5 |
| Menulist | menulist.menu | 第三方 | null | 8 | 8 |
| MenuToEat | menutoeat.com | 第三方 | null | 1 | 2 |
| VMbook | vmbook.com | 第三方 | null | 1 | 2 |
| umchef | umchef.com | 口碑 | 评分与评价聚合 | 27 | 29 |
| DiningOut | diningout.com | 第三方 | null | 6 | 6 |
| Find. Eat. Drink. | findeatdrink.com | 第三方 | null | 39 | 39 |
| Condé Nast Traveler | cntraveler.com | 第三方 | null | 60 | 65 |
| Menufy | menufy.com | 外卖 | null | 1 | 1 |
| MenuPages | menupages.com | 第三方 | null | 1 | 1 |
| RestaurantJump | restaurantjump.com | 口碑 | 评分与评价聚合 | 1 | 1 |
| ResMenu | resmenu.com | 第三方 | null | 7 | 7 |
| BestInHood | bestinhood.com | 第三方 | null | 32 | 35 |
| Moodap | moodap.com | 第三方 | null | 32 | 34 |
| YaY NYC | yaynyc.com | 第三方 | null | 10 | 14 |
| MealDeals | mealdeals.com | 第三方 | null | 4 | 4 |
| Gofy | gofyapp.com | 第三方 | null | 2 | 2 |
| ReservationFinder | reservationfinder.io | 订位 | null | 2 | 2 |
| It's a Date | itsadate.nyc | 订位 | null | 17 | 19 |
| DinnerElite | dinnerelite.com | 订位 | null | 6 | 6 |
| Welcome to Chinatown | welcometochinatown.com | 第三方 | null | 136 | 146 |
| Think!Chinatown | thinkchinatown.org | 第三方 | null | 71 | 105 |
| Explore Chinatown | explorechinatown.com | 第三方 | null | 346 | 652 |
| AYCE Guide | allyoucaneatguide.com | 口碑 | 品类专属 | 49 | 49 |
| All You Can Eat NYC | allyoucaneat.nyc | 口碑 | 品类专属 | 13 | 13 |
| Buffet Locator | buffetlocator.com | 口碑 | 品类专属 | 6 | 10 |

### 004 · Bao Noodle House

来源工作簿为 Bao_Noodle_House_Statistics.xlsx，共 600 题。

| 来源／对应品类板块 | 域名／对应板块路径 | 大类 | JSON 子类 | 平台引用题数 | 平台返回 URL 累计数 |
| --- | --- | --- | --- | ---: | ---: |
| The Infatuation — 汤面／饺子专题 | theinfatuation.com<br>汤面：[/new-york/guides/best-noodle-soup-nyc](https://www.theinfatuation.com/new-york/guides/best-noodle-soup-nyc)<br>饺子：[/new-york/guides/the-dumpling-map](https://www.theinfatuation.com/new-york/guides/the-dumpling-map) | 第三方 | 品类专属 | 423 | 880 |
| Eater — 纽约汤面专题文章 | ny.eater.com<br>汤面：[/2023/1/24/23559677/nycs-best-noodle-soup](https://ny.eater.com/2023/1/24/23559677/nycs-best-noodle-soup) | 第三方 | 品类专属 | 582 | 1423 |
| Reddit | reddit.com | 社交 | null | 361 | 795 |
| Corner | corner.inc | 口碑 | 社区点评与口碑汇总 | 180 | 275 |
| Tripadvisor | tripadvisor.com | 口碑 | 综合门店评价 | 109 | 136 |
| Restaurantji | restaurantji.com | 口碑 | 评分与评价聚合 | 10 | 10 |
| WhereYouEat | whereyoueat.com | 第三方 | null | 9 | 15 |
| Time Out | timeout.com | 第三方 | null | 224 | 278 |
| Yelp | yelp.com | 口碑 | 综合门店评价 | 1 | 1 |
| OpenTable | opentable.com | 订位 | null | 185 | 300 |
| Resy | resy.com | 订位 | null | 115 | 130 |
| The MICHELIN Guide | guide.michelin.com | 第三方 | null | 190 | 285 |
| Tasting Table | tastingtable.com | 第三方 | null | 1 | 1 |
| Restaurant Guru | restaurantguru.com | 口碑 | 评分与评价聚合 | 2 | 3 |
| MenuPix | menupix.com | 第三方 | null | 3 | 4 |
| Allmenus | allmenus.com | 第三方 | null | 1 | 1 |
| Grubhub | grubhub.com | 外卖 | null | 5 | 6 |
| Seamless | seamless.com | 外卖 | null | 8 | 10 |
| Uber Eats | ubereats.com | 外卖 | null | 65 | 101 |
| DoorDash | doordash.com | 外卖 | null | 46 | 83 |
| Toast / Toast Local | toasttab.com | 外卖 | null | 23 | 47 |
| Beyond Menu | beyondmenu.com | 外卖 | null | 4 | 4 |
| Lemon8 | lemon8-app.com | 社交 | null | 1 | 1 |
| Thrillist | thrillist.com | 第三方 | null | 1 | 1 |
| Happy Hour NYC | happy-hour.nyc | 第三方 | null | 168 | 210 |
| PageNearby | pagenearby.com | 口碑 | 评分与评价聚合 | 46 | 49 |
| Pearl | joinpearl.co | 第三方 | null | 36 | 45 |
| East Table | easttable.com | 第三方 | null | 114 | 114 |
| Atly | atly.com | 第三方 | null | 97 | 181 |
| AutoReserve | autoreserve.com | 订位 | null | 1 | 1 |
| EatOutMap | eatoutmap.com | 第三方 | null | 3 | 3 |
| Wanderlog | wanderlog.com | 第三方 | null | 3 | 3 |
| The Real Yellow Pages | yellowpages.com | 第三方 | null | 3 | 4 |
| Grub Street | grubstreet.com | 第三方 | null | 153 | 158 |
| Starved.io | starved.io | 口碑 | 社区点评与口碑汇总 | 12 | 12 |
| Bon Appétit | bonappetit.com | 第三方 | null | 75 | 75 |
| Food & Wine | foodandwine.com | 第三方 | null | 150 | 156 |
| Serious Eats | seriouseats.com | 第三方 | null | 173 | 175 |
| MenuWeb | menuweb.menu | 第三方 | null | 57 | 63 |
| Order.online | order.online | 外卖 | null | 36 | 59 |
| SevenRooms | sevenrooms.com | 订位 | null | 5 | 7 |
| taste | tastetheapp.com | 口碑 | 社区点评与口碑汇总 | 2 | 2 |
| Fantuan | fantuan.ca | 外卖 | null | 10 | 21 |
| SnagRes | snagres.com | 订位 | null | 14 | 20 |
| Waitlist Wizard | waitlistwizard.com | 订位 | null | 13 | 13 |
| SeatSwiper | seatswiper.com | 订位 | null | 2 | 2 |
| Chowbus | chowbus.com | 外卖 | null | 12 | 12 |
| Menulist | menulist.menu | 第三方 | null | 26 | 28 |
| MenuToEat | menutoeat.com | 第三方 | null | 1 | 2 |
| VMbook | vmbook.com | 第三方 | null | 1 | 1 |
| umchef | umchef.com | 口碑 | 评分与评价聚合 | 42 | 46 |
| DiningOut | diningout.com | 第三方 | null | 4 | 4 |
| Find. Eat. Drink. | findeatdrink.com | 第三方 | null | 63 | 63 |
| Condé Nast Traveler | cntraveler.com | 第三方 | null | 62 | 66 |
| Menufy | menufy.com | 外卖 | null | 1 | 1 |
| MenuPages | menupages.com | 第三方 | null | 4 | 4 |
| RestaurantJump | restaurantjump.com | 口碑 | 评分与评价聚合 | 1 | 1 |
| ResMenu | resmenu.com | 第三方 | null | 2 | 2 |
| BestInHood | bestinhood.com | 第三方 | null | 9 | 9 |
| Moodap | moodap.com | 第三方 | null | 19 | 21 |
| YaY NYC | yaynyc.com | 第三方 | null | 9 | 13 |
| MealDeals | mealdeals.com | 第三方 | null | 6 | 6 |
| Gofy | gofyapp.com | 第三方 | null | 2 | 2 |
| ReservationFinder | reservationfinder.io | 订位 | null | 2 | 2 |
| It's a Date | itsadate.nyc | 订位 | null | 18 | 20 |
| DinnerElite | dinnerelite.com | 订位 | null | 6 | 6 |
| Welcome to Chinatown | welcometochinatown.com | 第三方 | null | 102 | 112 |
| Think!Chinatown | thinkchinatown.org | 第三方 | null | 50 | 82 |
| Explore Chinatown | explorechinatown.com | 第三方 | null | 358 | 737 |
| Buffet Locator | buffetlocator.com | 第三方 | null | 4 | 5 |

### 001 · Frydom Express

来源工作簿为 Frydom_Express_GEO_Platform_Statistics.xlsx，共 600 题。

| 来源／对应品类板块 | 域名／对应板块路径 | 大类 | JSON 子类 | 平台引用题数 | 平台返回 URL 累计数 |
| --- | --- | --- | --- | ---: | ---: |
| The Infatuation — 炸鸡频道／榜单 | theinfatuation.com<br>炸鸡频道：[/new-york/cuisines/fried-chicken](https://www.theinfatuation.com/new-york/cuisines/fried-chicken)<br>炸鸡榜单：[/new-york/guides/best-fried-chicken-nyc](https://www.theinfatuation.com/new-york/guides/best-fried-chicken-nyc) | 第三方 | 品类专属 | 224 | 386 |
| Eater — 纽约炸鸡／鸡翅榜单 | ny.eater.com<br>炸鸡：[/maps/nyc-fried-chicken-best](https://ny.eater.com/maps/nyc-fried-chicken-best)<br>鸡翅：[/maps/best-chicken-wings-nyc](https://ny.eater.com/maps/best-chicken-wings-nyc) | 第三方 | 品类专属 | 432 | 856 |
| Reddit | reddit.com | 社交 | null | 320 | 662 |
| Corner | corner.inc | 口碑 | 社区点评与口碑汇总 | 251 | 499 |
| Tripadvisor | tripadvisor.com | 口碑 | 综合门店评价 | 151 | 223 |
| Restaurantji | restaurantji.com | 口碑 | 评分与评价聚合 | 73 | 114 |
| Zmenu | zmenu.com | 第三方 | null | 3 | 4 |
| WhereYouEat | whereyoueat.com | 第三方 | null | 21 | 36 |
| Time Out | timeout.com | 第三方 | null | 36 | 44 |
| OpenTable | opentable.com | 订位 | null | 64 | 139 |
| Resy | resy.com | 订位 | null | 10 | 11 |
| The MICHELIN Guide | guide.michelin.com | 第三方 | null | 28 | 41 |
| Tasting Table | tastingtable.com | 第三方 | null | 2 | 2 |
| Restaurant Guru | restaurantguru.com | 口碑 | 评分与评价聚合 | 14 | 14 |
| MenuPix | menupix.com | 第三方 | null | 35 | 44 |
| Allmenus | allmenus.com | 第三方 | null | 10 | 14 |
| Grubhub | grubhub.com | 外卖 | null | 19 | 23 |
| Seamless | seamless.com | 外卖 | null | 28 | 28 |
| Uber Eats | ubereats.com | 外卖 | null | 180 | 634 |
| DoorDash | doordash.com | 外卖 | null | 42 | 68 |
| Toast / Toast Local | toasttab.com | 外卖 | null | 34 | 46 |
| Beyond Menu | beyondmenu.com | 外卖 | null | 3 | 3 |
| YouTube | youtube.com | 社交 | null | 1 | 1 |
| Happy Hour NYC | happy-hour.nyc | 第三方 | null | 66 | 89 |
| PageNearby | pagenearby.com | 口碑 | 评分与评价聚合 | 88 | 134 |
| Pearl | joinpearl.co | 第三方 | null | 4 | 4 |
| Atly | atly.com | 第三方 | null | 180 | 445 |
| EatOutMap | eatoutmap.com | 第三方 | null | 153 | 221 |
| Wanderlog | wanderlog.com | 第三方 | null | 17 | 30 |
| The Real Yellow Pages | yellowpages.com | 第三方 | null | 6 | 9 |
| Grub Street | grubstreet.com | 第三方 | null | 232 | 279 |
| Starved.io | starved.io | 口碑 | 社区点评与口碑汇总 | 11 | 11 |
| Bon Appétit | bonappetit.com | 第三方 | null | 10 | 10 |
| Food & Wine | foodandwine.com | 第三方 | null | 48 | 48 |
| Serious Eats | seriouseats.com | 第三方 | null | 7 | 7 |
| MenuWeb | menuweb.menu | 第三方 | null | 112 | 243 |
| Order.online | order.online | 外卖 | null | 25 | 44 |
| Fantuan | fantuan.ca | 外卖 | null | 5 | 7 |
| Maskay | maskay.com | 第三方 | null | 1 | 1 |
| SnagRes | snagres.com | 订位 | null | 7 | 8 |
| Waitlist Wizard | waitlistwizard.com | 订位 | null | 2 | 2 |
| SeatSwiper | seatswiper.com | 订位 | null | 2 | 2 |
| Menulist | menulist.menu | 第三方 | null | 3 | 3 |
| umchef | umchef.com | 口碑 | 评分与评价聚合 | 64 | 72 |
| DiningOut | diningout.com | 第三方 | null | 12 | 12 |
| Condé Nast Traveler | cntraveler.com | 第三方 | null | 29 | 29 |
| Menufy | menufy.com | 外卖 | null | 1 | 2 |
| MenuPages | menupages.com | 第三方 | null | 16 | 23 |
| BestInHood | bestinhood.com | 第三方 | null | 1 | 1 |
| YaY NYC | yaynyc.com | 第三方 | null | 1 | 1 |
| MealDeals | mealdeals.com | 第三方 | null | 3 | 7 |
| It's a Date | itsadate.nyc | 订位 | null | 2 | 2 |
| Buffet Locator | buffetlocator.com | 第三方 | null | 1 | 1 |

## store_listed 补充核查（2026-11-20）

本轮只补齐此前为 null 的 50 条记录（020：21 条，004：20 条，001：9 条）。核查采用限定域名的英文店名搜索，并补充地址、中文别名或全网交叉检索；随后访问 21 个平台的公开首页检查可达性和公开检索入口。对可用渠道进一步检查已发现的店页／文章、Thrillist 站内搜索、Resy 公共目录、Menufy 城市目录和门店官网外链。并未声称每个平台都能完成原生站内搜索：部分平台只有动态界面、访问受限或无公开检索入口。

true 的判定沿用 Issue #16：口碑／外卖／社交需要目标门店的店页／商家主页；第三方需要文章或资料页实际写到该店。店家与页面以名称加地址（或电话）核对。探店视频、用户笔记以及平台被 AI 引用本身均不等于店家拥有社交主页。

按用户最新指令，尝试后仍未取得可匹配证据的条目均填 false。该值是交付回退规则，不能区分「未收录」与「未能确认」。下面保留访问障碍和来源疑点，JSON 的 note 仍只使用空字符串或「新增」。原来已经是 true／false 的 150 条未在本轮全面重查。

| 门店 | 本轮补齐 | 本轮新增 true | 本轮回退 false | 最终 true | 最终 false | 最终 null |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 020 · Easy Joy | 21 | 2 | 19 | 21 | 56 | 0 |
| 004 · Bao Noodle House | 20 | 1 | 19 | 7 | 63 | 0 |
| 001 · Frydom Express | 9 | 0 | 9 | 8 | 45 | 0 |
| 合计 | 50 | 3 | 47 | 36 | 164 | 0 |

### 确认收录的新增证据

| 门店 | 平台／结果 | 可复核页面 | 匹配依据 |
| --- | --- | --- | --- |
| 020 · Easy Joy | Tasting Table：true | [The Best Chinese All-You-Can-Eat Buffets In The US](https://www.tastingtable.com/2213852/best-all-you-can-eat-chinese-buffets/) 中的 Easy Joy 段落 | 名称、145 Mulberry St、(929) 243-6130 及门店官网链接一致。 |
| 020 · Easy Joy | taste :)：true | [Easy Joy 店页](https://tastetheapp.com/place/easy-joy-dim-sum-ayce-hot-pot-yi-zhong-ren-dian-xin-he-zi-zhu-huo-guo/dd256055-8d3c-49ec-a51e-afd6b0a58aa8) | 店名与 145 Mulberry St 一致，页面链接到 easyjoybuffet.com。 |
| 004 · Bao Noodle House | taste :)：true | [Bao Noodle House 包之面店页](https://tastetheapp.com/place/bao-noodle-house-bao-zhi-mian/8d14d1f0-0c42-4dbd-999f-0655941ec6e2) | 中英文店名与 110 Bowery 一致。 |

### 50 条记录的逐平台核查结果

下表横向覆盖三店原先为 null 的记录，— 表示该店此平台本轮不属于待补条目，不表示未收录。所有列为 false 的条目都完成了对应店名的限定域名检索；可访问首页不是未收录证据，只是补充核查渠道。页面级正证据以上表为准。

| 域名 | 020 | 004 | 001 | 补充核查与限制 |
| --- | --- | --- | --- | --- |
| opentable.com | false | false | false | 店名限定域名检索无匹配；首页读取超时；原 Collect Information 记录也未找到匹配店页。 |
| resy.com | false | false | false | 店名检索无匹配；公共目录与官网外链交叉核查未取得对应店页；公共目录含动态内容，不能证明不存在。 |
| tastingtable.com | true | false | false | 020 取得正文、地址、电话正证据；004、001 店名／地址检索未找到对应文章。 |
| youtube.com | false | — | false | 查询频道／商家账号并检查门店官网外链，未确认属于目标门店的主页；不以第三方探店代替。 |
| lemon8-app.com | false | false | — | 店名、地址或餐饮限定查询未确认店家主页；同名无关内容排除。 |
| thrillist.com | false | false | — | 店名及地址检索后，使用公开 GET /search?q= 站内搜索；未发现匹配文章链接。 |
| autoreserve.com | false | false | — | 店名、街道地址查询未匹配；主页 HTTP 403；不绕过访问限制。 |
| sevenrooms.com | false | false | — | 限定域名检索无匹配；主页是平台产品介绍，未取得对应订位店页。 |
| tastetheapp.com | true | true | — | 两店均取得名称＋地址匹配店页；主页另一次请求 HTTP 429，不影响已确认页面。 |
| snagres.com | false | false | false | 店名限定域名与平台名称交叉查询无匹配；主页可访问，未取得目标店页。 |
| waitlistwizard.com | false | false | false | 店名限定域名与平台名称交叉查询无匹配；主页可访问，检索依赖动态界面。 |
| seatswiper.com | false | false | false | 店名限定域名与平台名称交叉查询无匹配；主页可访问，未取得目标店页。 |
| menutoeat.com | false | false | — | 店名及地址查询无匹配；首页可访问，未取得目标门店资料页。 |
| vmbook.com | false | false | — | 店名及地址查询无匹配；当前首页为虚拟机管理产品，原统计列到该域名的对应关系仍有疑点。 |
| menufy.com | false | false | false | 店名与地址查询无匹配；首页跳转商家产品介绍页，纽约／布鲁克林公开目录读取超时。 |
| restaurantjump.com | false | false | — | 店名及地址查询只出现不相干门店；主页 HTTP 403；未将其他门店算作匹配。 |
| resmenu.com | false | false | — | 店名／地址查询无匹配；直接访问证书校验失败，未关闭证书校验。 |
| gofyapp.com | false | false | — | 店名或地址限定查询无匹配；当前首页为活动／治安地图，原统计列到此域名的对应仍待原引用核实。 |
| reservationfinder.io | false | false | — | 店名或地址查询无匹配；主页可访问，相关结果为其他餐厅的订位提醒页。 |
| itsadate.nyc | false | false | false | 限定域名及店名与平台名交叉查询无匹配；主页可访问，未取得目标店页。 |
| dinnerelite.com | false | false | — | 店名限定域名查询无匹配；主页可访问，未取得目标店页。 |

订位类本轮共补齐 26 条，仍遵守不抓取订位业务数据、不将其 false 计为资料缺失的边界。以上验证没有修改引用题数、问题示例、分类、域名或新增标记。

## 来源对应与边界

平台统计列名到域名的对应沿用既有资料，新增低频列按公开产品对应。Pearl、ResMenu 等重名来源仍需用原始引用 URL 确认，当前域名对应为暂定。ReservationFinder 对应 reservationfinder.io。

历史 names.json 中 Google 中文名包括 Easy Joy、Bao Noodle House 和小龙坎三家。会议中的两家说法与该批次数据有差异。平台分类以各自问题库为统计依据。
