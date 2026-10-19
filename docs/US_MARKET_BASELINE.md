# 美国餐馆与英文资料基线

本次用户确认调整：工作站全部产品文案和 11 类资料目录使用英文，商家标准资料以美国餐馆和英文内容为基线。本文覆盖旧需求中的中国地区默认项；后续检测、优化和报告沿用本基线。开发协作文档可继续使用中文。

## 资料范围

| 分类 | 英文名称                     | 美国餐馆内容                                                                                                                                                                   |
| ---- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M01  | Identity & brand             | 英文主名称、分店与品牌、介绍、公共电话和邮箱；原文名称另存别名                                                                                                                 |
| M02  | Location & directions        | US、街道、Suite / unit、City、两位 State / territory、ZIP / ZIP+4、County / parish / borough、Neighborhood、WGS84 定位、交通与停车                                             |
| M03  | Hours & operating status     | 显式选择门店 IANA 时区、每周安排、跨午夜、最后点单、Holiday & special hours；按门店时区解释夏令时                                                                              |
| M04  | Menus, food & beverages      | 美国餐馆适用的菜系、早餐 / brunch / lunch / dinner / happy hour 菜单、菜品、饮品、规格、prix fixe、饮食及过敏信息                                                              |
| M05  | Pricing, taxes & payments    | USD、十进制金额、每人消费口径、是否含销售税、税费说明、可选小费、自动小费、强制服务费、付款方式、itemized receipts、优惠                                                       |
| M06  | Seating & amenities          | 总座位、four-top 等桌型、private dining、patio、停车、可达性、high chairs、平方英尺面积                                                                                        |
| M07  | Service & guest policies     | 堂食、takeout、delivery、curbside pickup、catering、drive-through、英里配送半径、预约 / walk-in / waitlist、爽约取消、BYOB / corkage、酒水服务、儿童、宠物与独立的服务动物政策 |
| M08  | Licenses & recognition       | 经营主体、当地 permit / certification、公开卫生检查链接和说明、奖项、媒体、厨师资历；不自动判断合规                                                                            |
| M09  | Content & media assets       | 英文内容、照片、菜单、使用授权、来源证据和附件；原文件与原文件名保持忠实                                                                                                       |
| M10  | Listings & channel snapshots | Google Business Profile、Apple Maps、Yelp、Tripadvisor、OpenTable、Resy、DoorDash、Uber Eats、Grubhub、官网等，均人工维护；不自动连接平台                                      |
| M11  | Internal client records      | 对接人、服务协议、目标和沟通记录，以英文维护；始终仅内部使用                                                                                                                   |

这些例子用于资料组织，不意味着每家门店都提供相应服务。未知仍为 unknown，不默认存在、不默认没有。

## 英文保存规则

- 所有界面标签、可访问名称、消息、业务错误和导出标题使用英文。稳定字段键、枚举和单位使用英文代码。
- 新建和修改的标准业务文本、说明、来源摘要与内部记录要求英文。保存端检查非拉丁文字，允许 Café 等带重音的名称；此检查不能识别所有拉丁文字语言，不提供自动翻译。
- 原文别名、曾用名、菜品原文别名、snapshot.raw_*、平台原文标签、品牌原文别名和原文件名 / 附件内容可以保留原文。它们是原始资料，不应被静默翻译或替换。
- 已有非英文标准资料继续读取，readiness.english_review_fields 和英文提示指出待复核项。编辑无关字段不强迫改写旧事实。操作者确认后的英文值通过正常保存产生新版本。
- 不自动翻译旧库、不重命名附件、不将 CNY 改成 USD 或将平方米改成平方英尺。旧版本、证据和关联保持不变。

## 契约与兼容

公开契约升级为 **f1.v2**。这是写入约束变更：createMerchant 新增必填 timezone，必须是公开目录支持的美国 IANA 时区；没有统一默认美国时区。旧调用方先补该参数并接受 f1.v2，不能忽略创建失败。city、state、postal_code 为可选字段，未填写为 unknown；region 与 address 等原有建档必填项保留。

新档案 country=US、commercial.currency=USD，仍为未核实、待确认公开。新录入美国标准价格使用 USD；新录入坐标系使用 WGS84。电话支持十位号码或 +1 前缀，分机独立保存；ZIP 保留前导零。这些是格式校验，不是地址、号码所有权或地理位置验证。

新增可选事实：location.state、postal_code、county；commercial.sales_tax_included、sales_tax_note、gratuity_policy、service_charge_policy、receipt_available、receipt_note；space.area_sq_ft；service.delivery_distance_miles、curbside_pickup、catering、drive_through、alcohol_service、service_animal_policy；credentials.health_inspection_url、health_inspection_note。

province、district、invoice、invoice_note、area（sq m）、delivery_distance（km）保留原键和原单位，并标记 legacy。未填写的 legacy 字段不出现在新录入表单和完善度计数中；已填写的旧字段仍可见。新增字段按 unknown 补全，不写回旧快照。

本次不修改数据库 SQL 表结构：分组字段已存于各自表的受校验 JSON。SQL 迁移编号保持不变；旧备份可在新程序中校验恢复，恢复不会转换文字和单位。升级前仍应关闭旧服务并保留完整备份。降级旧程序前需恢复升级前备份，不能用旧程序编辑含新增字段的资料。

每日自动备份按工作站电脑时区判断日期，可用 GEOBASE_WORKSTATION_TIMEZONE 覆盖；独立于每家餐馆时区。示例改存至隔离的 .local/demo-us，既有 .local/demo 和正式数据不覆盖。

## 资料设计参考

- [USPS Publication 28](https://pe.usps.com/cpim/ftp/pubs/pub28/pub28.pdf)：美国城市、两位州代码及 ZIP / ZIP+4 地址形式。
- [FDA major food allergens](https://www.fda.gov/food/food-allergies/faster-act-sesame-ninth-major-food-allergen)：过敏信息提示覆盖九类主要过敏原，包括芝麻；不把未记录当作无过敏原。
- [Google Business Profile local links](https://support.google.com/business/answer/6218037?hl=en)：菜单、点餐和预约入口分别维护。

不预置全美统一销售税、服务费、小费比例、卫生评级制度或酒水许可规则。这里只记录门店确认的事实与来源，不替代法律或食品安全判断。
