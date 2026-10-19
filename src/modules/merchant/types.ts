import type {
  GroupKey,
  RecordType,
  FACT_FIELDS,
  RECORD_TYPES,
  FieldDefinition,
} from "./catalog";
export type ValueState = "known" | "unknown" | "not_applicable";
export type Publication = "public" | "internal" | "pending";
export type Verification = "unverified" | "verified" | "disputed";
export type Projection = "workspace" | "geo_context" | "publishable";
export interface Period {
  start: string;
  end: string;
  end_day_offset: 0 | 1;
  last_order?: string;
  last_order_day_offset?: 0 | 1;
  label?: string;
}
export interface DayHours {
  day: number;
  mode: "unknown" | "closed" | "all_day" | "periods";
  periods: Period[];
}
export type Value = string | number | boolean | string[] | DayHours[] | null;
export type DefinitionValue<D extends FieldDefinition> = D["key"] extends
  "amount" | "amount_max" | "average_spend" | "average_spend_max"
  ? string
  : D["kind"] extends "boolean"
    ? boolean
    : D["kind"] extends "integer"
      ? number
      : D["kind"] extends "number"
        ? string | number
        : D["kind"] extends "tags"
          ? string[]
          : D["kind"] extends "hours"
            ? DayHours[]
            : string;
export type GroupValues<G extends GroupKey> = {
  [D in (typeof FACT_FIELDS)[G][number] as D["key"]]?: DefinitionValue<D>;
};
type RecordFields<T extends RecordType> =
  (typeof RECORD_TYPES)[T]["fields"][number];
export type RecordValues<T extends RecordType> = {
  [
    D in RecordFields<T> as D extends { required: true } ? D["key"] : never
  ]: DefinitionValue<D>;
} & {
  [
    D in RecordFields<T> as D extends { required: true } ? never : D["key"]
  ]?: DefinitionValue<D>;
};
export type TypedRecordInput<T extends RecordType> = {
  record_type: T;
  record_id?: string;
  values: RecordValues<T>;
  metadata?: Partial<Fact>;
};
export interface Fact<T = Value> {
  precision?: "year" | "month" | "day";
  options?: { id: string; label: string }[];
  field_key: string;
  value_state: ValueState;
  value: T | null;
  verification_state: Verification;
  publication_state: Publication;
  source_type: string;
  source_note: string;
  collected_at: string | null;
  verified_at: string | null;
  valid_from: string | null;
  valid_to: string | null;
  evidence_ids: string[];
  note: string;
  not_applicable_reason: string;
  unit?: string;
  currency?: string;
}
export interface CollectionState {
  value_state: ValueState;
  not_applicable_reason: string;
}
export interface AssetFile {
  id: string;
  original_name: string;
  mime: string;
  size: number;
  sha256: string;
  uploaded_at: string;
  width?: number;
  height?: number;
}
export interface MerchantRecord {
  record_id: string;
  merchant_id: string;
  record_type: RecordType;
  values: Record<string, Value>;
  metadata: Fact;
  created_at: string;
  updated_at: string;
  needs_review?: boolean;
  based_on_version?: number;
  file?: AssetFile;
}
export interface Brand {
  brand_id: string;
  brand_version: number;
  name: string;
  aliases: string[];
  founded_year: string;
  description: string;
  publication_state: Publication;
  created_at: string;
  updated_at: string;
}
export interface Profile {
  merchant_id: string;
  profile_version: number;
  brand_id: string | null;
  brand: Brand | null;
  created_at: string;
  updated_at: string;
  archived: boolean;
  archived_at: string | null;
  groups: Record<GroupKey, Record<string, Fact>>;
  records: Record<RecordType, MerchantRecord[]>;
  collection_states: Record<RecordType, CollectionState>;
}
export interface Change {
  version: number;
  at: string;
  type: string;
  changes: { path: string; before: unknown; after: unknown }[];
}
export type ErrorCode =
  | "MERCHANT_NOT_FOUND"
  | "PROFILE_VERSION_NOT_FOUND"
  | "INVALID_ARGUMENT"
  | "RECORD_NOT_FOUND"
  | "OWNERSHIP_MISMATCH"
  | "VERSION_CONFLICT"
  | "ASSET_UNAVAILABLE"
  | "STORAGE_ERROR";
export type Result<T> =
  | { ok: true; contract_version: "f1.v2"; data: T }
  | {
      ok: false;
      contract_version: "f1.v2";
      error: { code: ErrorCode; message: string; details?: unknown };
    };
export interface Repository {
  options(): { id: string; kind: string; label: string }[];
  saveOption(option: { id: string; kind: string; label: string }): void;
  transaction<T>(fn: () => T): T;
  list(): Profile[];
  read(id: string, version?: number): Profile | undefined;
  save(profile: Profile, change: Change): void;
  history(id: string): Change[];
  brands(): Brand[];
  saveBrand(brand: Brand): void;
}
export interface AssetStore {
  max_bytes?: number;
  put(bytes: Uint8Array, info: { name: string; mime: string }): AssetFile;
  read(file: AssetFile): Uint8Array;
}
export interface ServiceDependencies {
  repository: Repository;
  assets: AssetStore;
  clock?: () => Date;
  id?: () => string;
}
export interface MerchantQuery {
  merchant_id: string;
  profile_version?: number;
}
export interface VersionCommand {
  merchant_id: string;
  expected_profile_version: number;
}
export interface PageInput {
  page: number;
  page_size: number;
}
export interface ProfileQuery extends MerchantQuery {
  projection: Projection;
  as_of_date?: string;
}
export interface RecordInput {
  record_id?: string;
  record_type: RecordType;
  values: Record<string, Value>;
  metadata?: Partial<Fact>;
}
export interface CreateInput {
  new_brand?: { name: string };
  display_name: string;
  region: string;
  address: string;
  primary_cuisines: string[];
  brand_id: string | null;
  timezone: string;
  city?: string;
  state?: string;
  postal_code?: string;
}
