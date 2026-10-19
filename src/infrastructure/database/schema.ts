import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
export const options = sqliteTable(
  "merchant_options",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    label: text("label").notNull(),
  },
  (t) => [uniqueIndex("merchant_options_kind_label_idx").on(t.kind, t.label)],
);
export const brands = sqliteTable("brands", {
  id: text("id").primaryKey(),
  version: integer("version").notNull(),
  body: text("body").notNull(),
});
export const brandVersions = sqliteTable("brand_versions", {
  key: text("key").primaryKey(),
  brandId: text("brand_id").notNull(),
  version: integer("version").notNull(),
  body: text("body").notNull(),
});
export const merchants = sqliteTable(
  "merchants",
  {
    id: text("id").primaryKey(),
    version: integer("version").notNull(),
    brandId: text("brand_id").references(() => brands.id),
    name: text("name").notNull(),
    address: text("address").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    archived: integer("archived", { mode: "boolean" }).notNull(),
    archivedAt: text("archived_at"),
    brandSnapshot: text("brand_snapshot"),
    collections: text("collections").notNull(),
  },
  (t) => [
    index("merchants_brand_idx").on(t.brandId),
    index("merchants_updated_idx").on(t.updatedAt),
  ],
);
export const profileVersions = sqliteTable(
  "profile_versions",
  {
    key: text("key").primaryKey(),
    merchantId: text("merchant_id")
      .notNull()
      .references(() => merchants.id),
    version: integer("version").notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    body: text("body").notNull(),
    change: text("change").notNull(),
  },
  (t) => [index("profile_versions_merchant_idx").on(t.merchantId, t.version)],
);
const groupTable = (name: string) =>
  sqliteTable(name, {
    merchantId: text("merchant_id")
      .primaryKey()
      .references(() => merchants.id),
    facts: text("facts").notNull(),
  });
const records = (name: string) =>
  sqliteTable(
    name,
    {
      id: text("id").primaryKey(),
      merchantId: text("merchant_id")
        .notNull()
        .references(() => merchants.id),
      body: text("body").notNull(),
    },
    (t) => [index(name + "_merchant_idx").on(t.merchantId)],
  );
export const identity = groupTable("profile_identity");
export const location = groupTable("profile_location");
export const operations = groupTable("profile_operations");
export const offering = groupTable("profile_offering");
export const commercial = groupTable("profile_commercial");
export const space = groupTable("profile_space");
export const service = groupTable("profile_service");
export const credentials = groupTable("profile_credentials");
export const content = groupTable("profile_content");
export const channels = groupTable("profile_channels");
export const relationship = groupTable("profile_relationship");
export const alias = records("merchant_alias");
export const former_name = records("merchant_former_name");
export const contact = records("merchant_contact");
export const date_exception = records("merchant_date_exception");
export const menu = records("merchant_menu");
export const menu_category = records("merchant_menu_category");
export const dish = records("merchant_dish");
export const dish_spec = records("merchant_dish_spec");
export const packageRecords = records("merchant_package");
export const price = records("merchant_price");
export const fee = records("merchant_fee");
export const minimum = records("merchant_minimum");
export const deposit = records("merchant_deposit");
export const promotion = records("merchant_promotion");
export const tableRecords = records("merchant_table");
export const room = records("merchant_room");
export const service_rule = records("merchant_service_rule");
export const credential = records("merchant_credential");
export const award = records("merchant_award");
export const media = records("merchant_media");
export const asset = records("merchant_asset");
export const copy = records("merchant_copy");
export const evidence = records("merchant_evidence");
export const channel = records("merchant_channel");
export const snapshot = records("merchant_snapshot");
export const person = records("merchant_person");
export const agreement = records("merchant_agreement");
export const communication = records("merchant_communication");
export const scene = records("merchant_scene");
