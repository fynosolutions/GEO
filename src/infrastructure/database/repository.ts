import { eq, and } from "drizzle-orm";
import * as schema from "./schema";
import type { Connection } from "./connection";
import {
  GROUPS,
  RECORD_NAMES,
  hydrateMerchantProfile,
  type Profile,
  type Repository,
  type Change,
  type Brand,
  type GroupKey,
  type RecordType,
} from "../../modules/merchant/public";
const groupTables = {
  identity: schema.identity,
  location: schema.location,
  operations: schema.operations,
  offering: schema.offering,
  commercial: schema.commercial,
  space: schema.space,
  service: schema.service,
  credentials: schema.credentials,
  content: schema.content,
  channels: schema.channels,
  relationship: schema.relationship,
};
const recordTables = {
  alias: schema.alias,
  former_name: schema.former_name,
  contact: schema.contact,
  date_exception: schema.date_exception,
  menu: schema.menu,
  menu_category: schema.menu_category,
  dish: schema.dish,
  dish_spec: schema.dish_spec,
  package: schema.packageRecords,
  price: schema.price,
  fee: schema.fee,
  minimum: schema.minimum,
  deposit: schema.deposit,
  promotion: schema.promotion,
  table: schema.tableRecords,
  room: schema.room,
  service_rule: schema.service_rule,
  credential: schema.credential,
  award: schema.award,
  media: schema.media,
  asset: schema.asset,
  copy: schema.copy,
  evidence: schema.evidence,
  channel: schema.channel,
  snapshot: schema.snapshot,
  person: schema.person,
  agreement: schema.agreement,
  communication: schema.communication,
  scene: schema.scene,
};
export function createRepository(connection: Connection): Repository {
  const { db, native } = connection;
  return {
    options() {
      return db.select().from(schema.options).all();
    },
    saveOption(option) {
      db.insert(schema.options).values(option).run();
    },
    transaction<T>(fn: () => T): T {
      return native.transaction(fn).immediate();
    },
    list() {
      return db
        .select({ body: schema.profileVersions.body })
        .from(schema.merchants)
        .innerJoin(
          schema.profileVersions,
          and(
            eq(schema.merchants.id, schema.profileVersions.merchantId),
            eq(schema.merchants.version, schema.profileVersions.version),
          ),
        )
        .all()
        .map((r) => hydrateMerchantProfile(JSON.parse(r.body) as Profile));
    },
    read(id, version) {
      if (version !== undefined) {
        const row = db
          .select()
          .from(schema.profileVersions)
          .where(eq(schema.profileVersions.key, id + ":" + version))
          .get();
        return row
          ? hydrateMerchantProfile(JSON.parse(row.body) as Profile)
          : undefined;
      }
      const row = db
        .select()
        .from(schema.merchants)
        .where(eq(schema.merchants.id, id))
        .get();
      if (!row) return;
      const p: Profile = {
        merchant_id: row.id,
        profile_version: row.version,
        brand_id: row.brandId,
        brand: row.brandSnapshot ? JSON.parse(row.brandSnapshot) : null,
        created_at: row.createdAt,
        updated_at: row.updatedAt,
        archived: row.archived,
        archived_at: row.archivedAt,
        groups: {} as Profile["groups"],
        records: {} as Profile["records"],
        collection_states: JSON.parse(row.collections),
      };
      for (const g of Object.keys(GROUPS) as GroupKey[]) {
        const t = groupTables[g];
        const data = db.select().from(t).where(eq(t.merchantId, id)).get();
        p.groups[g] = data ? JSON.parse(data.facts) : {};
      }
      for (const type of RECORD_NAMES) {
        const t = recordTables[type];
        p.records[type] = db
          .select()
          .from(t)
          .where(eq(t.merchantId, id))
          .all()
          .map((r) => JSON.parse(r.body));
      }
      return hydrateMerchantProfile(p);
    },
    save(p, change) {
      const row = {
        id: p.merchant_id,
        version: p.profile_version,
        brandId: p.brand_id,
        name: String(p.groups.identity.display_name.value),
        address: String(p.groups.location.address.value),
        createdAt: p.created_at,
        updatedAt: p.updated_at,
        archived: p.archived,
        archivedAt: p.archived_at,
        brandSnapshot: p.brand ? JSON.stringify(p.brand) : null,
        collections: JSON.stringify(p.collection_states),
      };
      db.insert(schema.merchants)
        .values(row)
        .onConflictDoUpdate({ target: schema.merchants.id, set: row })
        .run();
      for (const g of Object.keys(GROUPS) as GroupKey[]) {
        const t = groupTables[g];
        db.insert(t)
          .values({
            merchantId: p.merchant_id,
            facts: JSON.stringify(p.groups[g]),
          })
          .onConflictDoUpdate({
            target: t.merchantId,
            set: { facts: JSON.stringify(p.groups[g]) },
          })
          .run();
      }
      for (const type of RECORD_NAMES) {
        const t = recordTables[type];
        const existing = db
          .select()
          .from(t)
          .where(eq(t.merchantId, p.merchant_id))
          .all();
        const wanted = new Map(
          p.records[type].map((r) => [r.record_id, JSON.stringify(r)]),
        );
        for (const r of existing) {
          if (!wanted.has(r.id)) db.delete(t).where(eq(t.id, r.id)).run();
          else if (wanted.get(r.id) === r.body) wanted.delete(r.id);
        }
        for (const [rid, body] of wanted)
          db.insert(t)
            .values({ id: rid, merchantId: p.merchant_id, body })
            .onConflictDoUpdate({ target: t.id, set: { body } })
            .run();
      }
      db.insert(schema.profileVersions)
        .values({
          key: p.merchant_id + ":" + p.profile_version,
          merchantId: p.merchant_id,
          version: p.profile_version,
          body: JSON.stringify(p),
          change: JSON.stringify(change),
        })
        .run();
    },
    history(id) {
      return db
        .select()
        .from(schema.profileVersions)
        .where(eq(schema.profileVersions.merchantId, id))
        .all()
        .map((r) => JSON.parse(r.change) as Change)
        .sort((a, b) => b.version - a.version);
    },
    brands() {
      return db
        .select()
        .from(schema.brands)
        .all()
        .map((r) => JSON.parse(r.body) as Brand);
    },
    saveBrand(b) {
      const row = {
        id: b.brand_id,
        version: b.brand_version,
        body: JSON.stringify(b),
      };
      db.insert(schema.brands)
        .values(row)
        .onConflictDoUpdate({ target: schema.brands.id, set: row })
        .run();
      db.insert(schema.brandVersions)
        .values({
          key: b.brand_id + ":" + b.brand_version,
          brandId: b.brand_id,
          version: b.brand_version,
          body: JSON.stringify(b),
        })
        .run();
    },
  };
}
