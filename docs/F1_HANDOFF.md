# F1 开发与接口交接

当前地区与语言基线见 [US_MARKET_BASELINE.md](US_MARKET_BASELINE.md)。公开返回升级为 f1.v2；createMerchant 必填 timezone（美国 IANA 时区），可带 city、state、postal_code，未录入的可选项为 unknown。新建国家与币种为 US / USD，英文标准资料与原文来源分开维护。旧快照、附件和旧单位不改写。catalog 暴露 market、catalog_revision 和 timezones，后续模块据此读取，不重新定义美国餐馆主数据。

## 共用技术基线

沿用 F1_IMPLEMENTATION.md。页面、模块、基础设施边界不变；后续模块无需自建数据库、重新定义商家字段或复制可编辑主资料。应用组装在 src/app/workstation.ts，数据库和文件适配通过公开依赖类型注入服务。

完整包由 package-lock.json 锁定；npm ci 安装，不让每位开发者自行升级。SQL 迁移在 database/migrations，Drizzle 定义在 infrastructure/database/schema.ts。修改数据库时生成新迁移，不改已共享执行的迁移；检查两个分支的迁移顺序及 journal 冲突。

## 接入

```ts
import type { MerchantService, RecordValues } from '../src/modules/merchant/public';

async function example(service: MerchantService, merchant_id: string) {
  const profile = await service.getMerchantProfile({ merchant_id, projection: 'geo_context' });
  if (!profile.ok) return profile;
  const fixed = { merchant_id, profile_version: profile.data.profile_version };
  const facts = await service.getMerchantFacts({
    ...fixed, verified_only: true, as_of_date: profile.data.as_of_date,
  });
  // 内部读取不代表可以外发；外发另取 publishable。
  return facts;
}

const price: RecordValues<'price'> = {
  object_type: 'room', object_id: 'opaque-room-id',
  amount: '128.00', currency: 'USD', unit: 'room / event',
};
```

可执行的完整示例见 tests/merchant-client.ts；tests/full-catalog.test.ts 用虚构资料验证跨模块仅依赖公开入口的读取链。服务实例由应用提供，调用方不创建另一套连接。FACT_FIELDS、RECORD_TYPES、GroupValues、RecordValues、TypedRecordInput、Fact、Profile、Result 均从 public.ts 导出。

## 可调用能力

保留 API_CONTRACTS.md 的 9 项读取接口，并实现 findMerchantDuplicates、listBrands、createBrand、updateBrand、createMerchant、saveGroup、saveRecord、removeRecord、setCollectionState、verifyFacts、setPublication、archiveMerchant、getMerchantHistory、uploadMerchantAsset、readMerchantAsset、exportMerchant、recordChannelSnapshot。createMerchant 可带 new_brand，在同一事务内建品牌与门店，失败不残留品牌。

所有方法异步返回 Result，业务错误保留 f1.v2。HTTP 是浏览器适配，不是其他模块的接入基线；二进制附件和运维备份路由例外，按文件响应或运维结果返回。

写命令除创建外带 expected_profile_version。品牌更新带 expected_brand_version；品牌及关联门店在一个事务内更新。归档门店只读，需先恢复；品牌共享更新仍保留关联门店的新版本。

saveGroup 输入 group_key、fields（以本组短键索引的 Fact 补丁），身份组可同时变更 brand_id。普通保存不能自行提升核实状态。verifyFacts 独立接受 targets、state、source_note、verified_at 和可选证据，targets 为 `group.field` 或 `record_type:record_id`。setPublication 使用相同目标格式。

saveRecord 输入 record_type、可选 record_id、values 和可选 metadata。values 由具体记录目录校验，不接受未知字段。关系通过明细 ID 表达，按门店验证。原始快照只能追加，更正使用 corrects_id。删除当前记录不删除历史；快照不能删除，素材通过 usage=disabled 停用。

上传素材接收字节、名称、MIME 和分类，默认 50 MB，返回新资料版本。每份文件内容寻址且不可变，可被多个素材/记录引用。读取素材必须带 merchant_id、profile_version 和 projection；readMerchantAsset 返回 Uint8Array，getMerchantAsset 返回元数据和读取句柄，无机器绝对路径。

## 结构和稳定标识

Profile.groups 覆盖 11 个分组，每项事实包含 value_state、verification_state、publication_state 及来源、有效期、证据。Profile.records 按 RECORD_TYPES 提供有稳定 record_id 的明细，collection_states 区分尚未采集、确认没有和不适用。

getMerchantFieldCatalog 返回完整字段键、分组、输入类型、单位、多值标记、枚举、公开默认值、PRD 分类和明细定义。自定义菜系用独立 ID 存储；Fact.options 给出该版本的 ID 与标签，catalog.cuisine_options 提供当前可用项。录入命令接受已有 ID 或新标签，新标签产生稳定选项 ID。菜单分类使用 menu_category 明细 ID。其他自由文本列表不是枚举。

数值零与未知分开。金额以十进制字符串保存并带币种、计价单位；人均金额的币种来自 commercial.currency，金额事实同时返回 currency 和 unit。坐标经纬度成对保存，并保留坐标系。开业日期允许年、年月和完整日期，不补造月日。营业时间为 7 个 DayHours，跨午夜使用 end_day_offset；最后点单也保留日期偏移。

新增目录字段时，旧资料中不存在的新增可选项通过 hydrateMerchantProfile 只读补为未知，不写回旧快照。实际字段值、品牌、原有附件关联仍保持当时内容。破坏性类型或语义变更必须升级契约并协调调用方。

## 导出、备份与边界

exportMerchant 只使用 publishable，可选 asset_ids 默认为空。返回 Markdown 与 JSON；页面还提供包含选定素材副本的 ZIP，相对路径关联，不包含默认原始证据或内部元数据。记录标记可公开不自动核实。

完整备份为 `.geobase.zip`，含 database.sqlite、manifest.json、assets/内容哈希。包含所有内部资料和历史；不是公开导出。恢复严格校验迁移版本、数据库、记录数量、版本归属、当前表与最新快照一致性、品牌历史和附件清单/哈希，然后先备份当前实例，再整体替换。多实例锁与应用互斥保护恢复边界；未提交的目录替换若中断，下次启动按恢复日志还原原数据，异常日志不会被当作空白实例忽略。

自动备份以工作站电脑时区的日期判断首次启动，可由 GEOBASE_WORKSTATION_TIMEZONE 调整；保留最近 7 份成功自动备份。手动备份不自动清理。数据库和附件采用一致备份，不在运行中手工复制活动数据库文件。

## 两人开发约定

每个任务先同步代码并建立独立分支，明确模块、验收与接口影响。公共配置、迁移和契约安排一位协调人。另一个模块只从 public.ts 接入；新增可选字段兼容既有消费者。PR 同时交付代码、必要验证、文档和接入变化，另一人审查后合并。仓库当前未配置远程地址，远程仓库、分支保护和 CI 服务由团队实际接入时配置。
