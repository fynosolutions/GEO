# 模块接口与数据契约

当前版本为 **f1.v2**，美国餐馆与英文内容约定见 [US_MARKET_BASELINE.md](US_MARKET_BASELINE.md)。f1.v1 调用方升级时，createMerchant 必须补 timezone（实际门店的美国 IANA 时区），并接受 f1.v2 返回标识。新标准资料以英文、US 和 USD 维护；原文证据、别名与历史值不翻译。数据库及旧版本读取保持兼容。

字段目录新增 market、catalog_revision、timezones，公开 MARKET、US_STATES、US_TIMEZONES、WEEKDAYS 常量。新增地址、英制单位、税费小费、服务和卫生检查可选事实，旧字段保留原键及单位并标记 legacy；详细清单见美国餐馆基线。readiness.english_review_fields 为已有资料的英文复核提示，不改变原值或核实状态。

状态：F1 的 f1.v2 公开服务已实现。本文规定模块语义；完整字段、明细与类型由 merchant/public.ts 导出，初始化、写命令、样例及数据形式见 F1_HANDOFF.md。HTTP 仅是本机页面适配，SQLite/Drizzle 由应用统一组装。后续检测、优化和报告自身的接口仍待实现。

## 模块依赖边界

| 调用方 | 公开能力来源 | 用途 |
| --- | --- | --- |
| 页面入口 | 对应模块 public.ts | 执行用例、查询与展示 |
| 检测模块 | 商家模块 public.ts | 读取允许用于检测的资料及版本引用 |
| 优化模块 | 商家模块 public.ts | 读取标准事实、渠道快照及证据 |
| 报告模块 | 商家、检测、优化模块 public.ts | 汇总资料、检测结果与处理情况 |

公开接口可以先采用进程内函数，不因此单独引入 HTTP 服务。跨模块不直接查询对方数据表，不导入对方内部文件。

## 主要对象及归属

| 对象 | 业务归属 | 必须明确的关联与约定 |
| --- | --- | --- |
| 门店与资料版本 | merchant | merchant_id 标识具体门店；保留当前版本及历史可还原依据 |
| 渠道快照 | merchant | 所属门店、渠道、采集时间、原始内容及证据；历史不覆盖 |
| 素材与证据 | 所属业务模块 | 通过文件标识关联存储适配；明确来源、用途与公开范围 |
| 检测批次 | detection | 门店、当时资料版本、检测配置与评估规则版本 |
| 单次执行 | detection | 所属批次、提示词、模型、时间、状态、原始回答、证据及重试关系 |
| 问题与建议 | optimization | 门店、资料版本、字段、来源、判断依据和证据 |
| 修正任务 | optimization | 对应问题、处理状态、执行记录及复核关联 |
| 报告与比较 | reports | 资料版本、检测批次、指标口径、比较条件及解释限制 |

对象标识名称除已有 merchant_id 等 F1 约定外，均在实现时统一，不把此表直接当作数据库定义。

## 数据语义

- unknown、不适用与已知值不得混用；零、空字符串和空数组不得自动表示否。
- 核实状态独立于填写状态；标准事实变化后的处理遵循 F1 PRD。
- 不同门店的明细、快照和执行记录必须校验归属。
- 对外读取需明确用途和公开范围，内部对接信息不得默认发送给外部模型或进入公开导出。
- 时间保留必要时区语义，金额和数量保留单位。
- 诊断结果不直接改写标准事实；人工修正应通过商家模块完成并留存历史。

## F1 共享数据契约

### 契约版本与公开入口

首批契约版本为字符串 `f1.v2`，与单家门店的资料版本分开。后续模块只从 `src/modules/merchant/public.ts` 导入类型和服务工厂；具体初始化依赖由应用组装，不让调用方自己创建另一套数据库。

以下签名描述逻辑输入输出，采用异步调用；不要求独立 HTTP 服务。最终导出类型以此文和公开类型声明共同维护，不能由每个调用方另写一套字段解释。

### 标识 时间与基础类型

| 项目 | 契约 |
| --- | --- |
| `merchant_id`、明细 ID、品牌 ID、资产 ID、证据 ID | 不透明字符串，创建后稳定；调用方不解析其含义，不用名称或数组序号代替 |
| `profile_version` | 单门店从 1 开始的递增整数；内容变化产生新版本，不与其他门店比较大小 |
| `contract_version` | `f1.v2`，表示返回结构与字段语义版本 |
| 时间戳 | ISO 8601，包含 UTC 标记或偏移；页面按门店时区显示 |
| 日期与部分日期 | 完整日期 `YYYY-MM-DD`；只知道年或月时另带 `precision`，不虚构月日 |
| 金额 | 十进制字符串，例如 `"128.00"`，同时返回币种和计价单位；禁止浮点金额含糊传递 |
| 数量 | 整数或带明确单位的十进制值，零与未知分开 |
| 枚举与分类 | 稳定代码加显示名称；文案变化不改代码，自定义项分配独立 ID |
| 扩展字段 | 新增可选字段可兼容；删除、重命名、改变类型或含义视为不兼容变更 |

### 字段状态

普通业务事实使用以下逻辑结构；数据库不必按此逐字段建表。列表摘要可以返回扁平展示值，但不能替代完整事实接口。

| 键 | 值与含义 |
| --- | --- |
| `field_key` | 稳定字段键，例如 `identity.display_name` |
| `value_state` | `known`、`unknown`、`not_applicable` |
| `value` | 按字段类型保存；未知或不适用时为 `null`，不能传空串或零冒充未知 |
| `verification_state` | `unverified`、`verified`、`disputed`；未知字段不能标为已核实 |
| `publication_state` | `public`、`internal`、`pending`；不表示账号权限 |
| `unit`、`currency` | 按字段目录要求返回计量单位与币种；不适用的键可省略 |
| `source_type`、`source_note` | 来源类型与说明；人工录入默认 `manual_input`，不默认已核实 |
| `collected_at`、`verified_at` | 采集与核实时间；未核实的 `verified_at` 为 `null` |
| `valid_from`、`valid_to` | 适用日期范围；无界端为 `null`；跨午夜时段使用专门结构 |
| `evidence_ids` | 证据引用列表；无附件时可用文字核实说明，不虚构证据 ID |
| `note`、`not_applicable_reason` | 补充说明及不适用原因，作为内部元数据处理 |

已知的布尔否为 `value_state: known` 且 `value: false`。已核对且确认没有别名可返回已知空列表；未调查的别名为未知，不能混淆。重复明细除字段状态外具有 `record_id`，整个集合另有采集状态，区分“尚未录入”和“确认没有”。

### 资料分组与字段目录

| 分组键 | 对应 PRD | 常用结构化内容 |
| --- | --- | --- |
| `identity` | M01 | 名称、别名、曾用名、品牌引用、介绍、公共联系方式 |
| `location` | M02 | 行政区域、地址、商圈、坐标、入口及路线 |
| `operations` | M03 | 状态、时区、周营业时段、日期例外 |
| `offering` | M04 | 菜系、菜单、菜品、规格、套餐、供应情况 |
| `commercial` | M05 | 人均、价格、附加费、支付、优惠 |
| `space` | M06 | 总容量、桌型、包间、设施 |
| `service` | M07 | 用餐方式、配送、预约、接待和取消规则 |
| `credentials` | M08 | 经营主体、资质、奖项、报道、厨师资历 |
| `content` | M09 | 素材、文案、对象关联和使用条件 |
| `channels` | M10 | 渠道页面、原始快照、平台指标和链接状态 |
| `relationship` | M11 | 商家对接人、合作、服务目标和沟通记录 |
| `scene_tags` | 横向关联 | 场景、条件、依据引用、判断及待复核状态 |

字段目录由 F1 公开导出或通过 `getMerchantFieldCatalog()` 提供，至少包含字段键、所属分组、类型、单位、是否多值、枚举选项、公开默认值和 PRD 对应项。按分类开始实现前补齐该分类的具体类型和样例；不能让检测或优化模块靠猜测中文标签解析数据。

首批固定的核心键为：`identity.display_name`、`identity.branch_name`、`identity.aliases`、`identity.former_names`、`identity.public_contacts`、`location.address`、`location.coordinates`、`operations.status`、`operations.timezone`、`operations.weekly_hours`、`operations.date_exceptions`、`offering.primary_cuisines`、`commercial.average_spend`、`space.private_rooms`。名称别名核对结果由别名集合采集状态表达。

营业状态代码为 `unknown`、`preparing`、`open`、`temporarily_closed`、`permanently_closed`；归档用独立的 `archived` 布尔字段，不加入营业状态枚举。

### 读取投影与用途

| `projection` | 内容 | 使用约定 |
| --- | --- | --- |
| `workspace` | 全部 11 类资料及场景标签，包括内部与待确认数据 | 工作站内部编辑、核对、服务档案使用；必须显式请求，不直接外发 |
| `geo_context` | 餐馆事实、场景、素材与渠道引用，不包含 M11 内部服务档案；保留核实及公开状态 | 供内部检测和诊断准备使用；待确认数据仍可能存在，不能把整个返回值直接发给外部 AI |
| `publishable` | 明确可公开、当前有效且已知的业务值及允许公开的素材 | 用于外部 AI 输入、渠道发布和公开导出；未核实可公开事实仍保留未核实标记 |

调用 `getMerchantProfile` 时必须显式选择投影，不默认返回完整内部资料。`publishable` 排除 M11、内部及待确认字段、内部备注、原始来源说明和默认原始证据附件；只允许公开值、单位、适用条件和核实状态等白名单元数据。素材及其所属记录均需符合公开条件。必要的证据对外使用另行明确选择，不能随事实自动附带。

返回 `excluded_fields` 说明字段被排除的键和原因，不返回被排除的原值、联系人、文件名或内部备注。内部查询使用 `geo_context` 不等于已获准外发。

### 首批公开读取接口

| 操作 | 参数 | 结果 |
| --- | --- | --- |
| `listMerchants` | `query?`、`filters?`、`page`、`page_size` | 摘要列表、`merchant_id`、当前 `profile_version`、归档状态、分页总数；默认不含归档门店 |
| `getMerchantProfile` | `merchant_id`、`profile_version?`、`projection`、`as_of_date?` | 指定版本资料、字段状态、分类采集状态、资产引用及排除说明 |
| `getMerchantFacts` | `merchant_id`、`profile_version?`、`field_keys?`、`verified_only`、`as_of_date?` | 标准事实及来源；`verified_only: true` 时只给适用日期内已核实事实，其余键另列缺失或排除原因 |
| `getMerchantNames` | `merchant_id`、`profile_version?` | 正式名称、分店名、品牌名、当前别名、曾用名及各自状态，不把品牌命中视为分店确认 |
| `listMerchantRecords` | `merchant_id`、`profile_version`、`group_key`、`record_type`、`page`、`page_size`、`projection` | 某分类明细；明细类型必须来自字段目录；非法组合返回错误 |
| `listChannelSnapshots` | `merchant_id`、`profile_version?`、`channel_id?`、`time_range?`、分页 | 指定版本可见的快照，含原文、采集时间、证据引用、更正关系 |
| `getMerchantAsset` | `merchant_id`、`profile_version`、`asset_id`、`projection` | 指定版本可用的素材元数据及读取句柄，不返回机器绝对路径 |
| `getMerchantEvidence` | `merchant_id`、`profile_version`、`evidence_id` | 内部核实说明、来源与关联资产；无自动外发能力 |
| `getMerchantFieldCatalog` | 无 | 字段、记录类型和枚举定义及 `contract_version` |

`profile_version` 省略时读取调用开始时的当前版本，并在结果中明确返回。多次组合读取必须使用首次获得的版本；不能连续读取“最新值”后误称同一快照。列表是当前摘要，不是跨多次请求固定的数据快照。

所有依赖有效期的查询统一接受 `as_of_date`，默认按门店时区取本次调用的日期，并在结果返回实际适用日期和时区。版本固定原始资料，有效性筛选由适用日期决定；复现或组合读取时同时固定这三个条件，不能将日期变化误解为历史资料被修改。

`getMerchantFacts` 是内部事实读取，不以公开状态筛掉核对所需信息；外发必须经 `publishable` 投影或等价的商家模块过滤能力。按历史版本读取素材、快照及证据时，只能访问该版本可见的关联，不能混入后来上传的对象。

### 返回与错误

成功统一为 `{ ok: true, contract_version, data }`，门店相关完整查询在 `data` 内带 `merchant_id`、`profile_version`。分页统一在 `data` 内返回 `items`、`page`、`page_size`、`total`；`page` 从 1 开始，`page_size` 为 1 至 100 的整数。

失败统一为 `{ ok: false, contract_version, error: { code, message, details? } }`。错误不能伪装为成功的空列表；确实没有明细时才返回空集合并附带采集状态。

| 错误码 | 含义 |
| --- | --- |
| `MERCHANT_NOT_FOUND` | 门店不存在 |
| `PROFILE_VERSION_NOT_FOUND` | 指定资料版本不存在 |
| `INVALID_ARGUMENT` | 字段、分页、类型、投影或参数非法 |
| `RECORD_NOT_FOUND` | 关联记录不存在或在该版本不可见 |
| `OWNERSHIP_MISMATCH` | 明细不属于该门店或允许的共享品牌 |
| `VERSION_CONFLICT` | 编辑基于旧版本，需重新读取 |
| `ASSET_UNAVAILABLE` | 资产内容缺失或不可读取，不能只返回失效路径 |
| `STORAGE_ERROR` | 持久化失败；不把内部堆栈作为业务提示 |

### 最小读取示例

以下示例可基于应用注入的 merchantService 调用；可执行联调示例见 tests/merchant-client.ts。示例不要求调用方创建数据库连接。

```ts
// merchantService 由应用统一初始化，从 merchant/public.ts 取得公开类型和能力。
const current = await merchantService.getMerchantProfile({
  merchant_id: selectedMerchantId,
  projection: "geo_context",
});
if (!current.ok) throw new Error(current.error.message);

const fixedVersion = current.data.profile_version;
const fixedDate = current.data.as_of_date;
const facts = await merchantService.getMerchantFacts({
  merchant_id: selectedMerchantId,
  profile_version: fixedVersion,
  verified_only: true,
  as_of_date: fixedDate,
});
const names = await merchantService.getMerchantNames({
  merchant_id: selectedMerchantId,
  profile_version: fixedVersion,
});
if (!facts.ok) throw new Error(facts.error.message);
if (!names.ok) throw new Error(names.error.message);
// 检测批次保存 selectedMerchantId 和 fixedVersion；原始回答由检测模块维护。
// 上述内部读取值不能直接整体发给外部模型，外发另取 publishable 投影。
```

### 修改入口与归属

F1 页面通过本模块的创建、编辑、归档和核实用例保存资料。需要版本检查的更新带 `expected_profile_version`，事务同时提交资料和历史记录；部分失败不能留下半次保存。

为 B1 预留公开命令 `recordChannelSnapshot`，输入门店 ID、预期版本、渠道 ID、人工采集时间、原始字段、证据引用和可选被更正快照 ID。F1 校验归属后新增快照并生成新版本，旧快照原文不覆盖；具体命令在 B1 接入前与调用方补齐类型。本期必须完成 F1 内部人工采集流程，不能以等待 B1 为由缺失渠道资料管理。

其他模块建议修改标准事实时，由操作者进入 F1 编辑或使用明确公开的修改用例，不允许传入未经确认的 AI 输出直接覆盖事实。检测和优化自己的执行证据归各自模块；引用 F1 素材时只保存 ID 和版本关系。

### 交接与兼容

- F1 随实现交付公开类型、字段目录、虚构门店样例、调用示例和初始化说明，不能只交付页面或 JSON 导出文件。
- 联调至少覆盖全分类读取、分店隔离、固定版本、未知状态、公开过滤、附件读取和错误处理。
- 增加可选字段时保持既有语义；破坏性变更先更新契约、同步调用方并给出迁移说明。
- 全分类返回覆盖指所有已保存资料均有明确读取入口，不要求一次响应塞入全部文件和全部历史；明细可分页，文件按 ID 读取。

## 指标与复测

每个指标在实现前定义名称、含义、分子、分母、样本范围、失败处理及规则版本。不能在不同页面分别计算同名指标。

比较前核对门店、资料版本、提示词集合、模型、评估规则及采样条件。条件变化应明确标注；不得仅凭前后数值差异宣称优化产生效果。

## 已落实与后续接口边界

1. F1 当前表、不可变历史快照与变更日志同事务保存；品牌更新推进所有关联门店版本。
2. 全分类字段目录、明细类型、稳定菜系选项、虚构样例与公开入口读取已提供，详见 F1_HANDOFF.md。
3. 额外写命令及服务签名由 public.ts 显式导出；所有编辑检查预期版本。公开导出默认不选附件，可显式传 asset_ids。
4. 文件在引用提交前持久化并校验；完整备份包括数据库及所有历史引用文件，恢复校验并先备份当前数据。具体限制见交接与验证记录。
5. 检测执行状态、重试取消、字段匹配规则、指标公式及后续模块自身接口，在相应模块需求确认后实现。
