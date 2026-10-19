/**
 * F1 商家资料模块公开入口。应用统一初始化服务和存储依赖。
 * 其他模块从此导入公开类型和能力，数据约定见 docs/API_CONTRACTS.md。
 */
export { createMerchantService, type MerchantService } from "./service";
export { MARKET, US_STATES, US_TIMEZONES, WEEKDAYS } from "./us-market";
export {
  GROUPS,
  FACT_FIELDS,
  RECORD_TYPES,
  RECORD_NAMES,
  LABELS,
  COLLECTION_FIELDS,
  VIRTUAL_FACT_LABELS,
  recordDefinition,
} from "./catalog";
export type {
  GroupKey,
  RecordType,
  FieldDefinition,
  RecordDefinition,
  InputKind,
} from "./catalog";
export type * from "./types";
export {
  validateProfile as validateMerchantProfile,
  hydrateProfile as hydrateMerchantProfile,
} from "./rules";
