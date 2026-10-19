import {
  GROUPS,
  FACT_FIELDS,
  COLLECTION_FIELDS,
  VIRTUAL_FACT_LABELS,
  RECORD_NAMES,
  RECORD_TYPES,
  recordDefinition,
  type GroupKey,
  type RecordType,
} from "./catalog";
import type {
  Profile,
  Fact,
  Brand,
  ServiceDependencies,
  Result,
  MerchantQuery,
  VersionCommand,
  ProfileQuery,
  CreateInput,
  RecordInput,
  Value,
  Projection,
  PageInput,
  MerchantRecord,
} from "./types";
import {
  blankFact,
  check,
  BusinessError,
  validateProfile,
  project,
  readiness,
  timezone,
  dayInZone,
  validDate,
  validOn,
  timestamp,
} from "./rules";
import {
  MARKET,
  US_TIMEZONES,
  WEEKDAYS,
  hasNonLatinLetters,
  isOriginalSourceField,
} from "./us-market";
const english = (value: unknown, label: string) =>
  check(
    !hasNonLatinLetters(value),
    `${label}: enter English text. Keep original-language names and source quotations in their dedicated fields.`,
  );
const metadataKeys = [
  "source_type",
  "source_note",
  "note",
  "not_applicable_reason",
  "unit",
  "currency",
] as const;
function checkChangedEnglish(before: Profile, after: Profile) {
  for (const group of Object.keys(GROUPS) as GroupKey[])
    for (const def of FACT_FIELDS[group]) {
      const old = before.groups[group][def.key],
        next = after.groups[group][def.key];
      if (stable(old.value) !== stable(next.value)) {
        english(next.value, def.label);
        if (next.options)
          english(
            next.options.map((o) => o.label),
            def.label,
          );
        if (next.value_state === "known") {
          if (group === "location" && def.key === "country")
            check(next.value === "US", "New country values must use US.");
          if (after.groups.location.country.value === "US") {
            if (def.key === "currency")
              check(
                next.value === "USD",
                "U.S. standard prices must use USD. Changing a currency code does not convert an amount.",
              );
            if (def.key === "coordinate_system")
              check(
                next.value === "WGS84",
                "Use WGS84 for new U.S. coordinates. Legacy coordinates must be converted explicitly.",
              );
            if (def.key === "timezone")
              check(
                US_TIMEZONES.includes(
                  next.value as (typeof US_TIMEZONES)[number],
                ),
                "Select the restaurant's U.S. IANA time zone.",
              );
          }
        }
      }
      for (const key of metadataKeys)
        if (old[key] !== next[key]) english(next[key], `${def.label} ${key}`);
    }
  for (const type of RECORD_NAMES) {
    for (const r of after.records[type]) {
      const old = before.records[type].find((x) => x.record_id === r.record_id);
      for (const [key, value] of Object.entries(r.values))
        if (stable(old?.values[key]) !== stable(value)) {
          // Original filenames and source text must remain faithful to the source.
          if (
            !isOriginalSourceField(type, key) &&
            !(type === "asset" && key === "name" && r.file)
          )
            english(value, `${recordDefinition(type).label}: ${key}`);
          if (
            key === "currency" &&
            after.groups.location.country.value === "US"
          )
            check(
              value === "USD",
              "U.S. standard prices must use USD; no automatic currency conversion is performed.",
            );
        }
      if (
        type === "contact" &&
        after.groups.location.country.value === "US" &&
        stable(old?.values) !== stable(r.values) &&
        /^(phone|telephone|tel|sms|mobile)$/i.test(String(r.values.type))
      ) {
        const phone = String(r.values.value),
          digits = phone.replace(/\D/g, ""),
          national =
            digits.length === 11 && digits.startsWith("1")
              ? digits.slice(1)
              : digits;
        check(
          /^\+?[\d().\s-]+$/.test(phone) &&
            /^[2-9]\d{2}[2-9]\d{6}$/.test(national),
          "Enter a 10-digit U.S. phone number, optionally prefixed with +1. Use the separate extension field.",
        );
        if (r.values.country_prefix)
          check(
            ["+1", "1"].includes(String(r.values.country_prefix)),
            "U.S. phone calling code must be +1.",
          );
      }
      for (const key of metadataKeys)
        if (old?.metadata[key] !== r.metadata[key])
          english(r.metadata[key], key);
    }
    const old = before.collection_states[type],
      next = after.collection_states[type];
    if (old.not_applicable_reason !== next.not_applicable_reason)
      english(next.not_applicable_reason, "Reason not applicable");
  }
}
const stable = (v: unknown): string =>
  JSON.stringify(v, (_k, x) =>
    x && typeof x === "object" && !Array.isArray(x)
      ? Object.fromEntries(
          Object.keys(x)
            .sort()
            .map((k) => [k, x[k]]),
        )
      : x,
  );
const paginate = <T>(items: T[], args: PageInput) => {
  check(
    Number.isInteger(args.page) &&
      args.page >= 1 &&
      Number.isInteger(args.page_size) &&
      args.page_size >= 1 &&
      args.page_size <= 100,
    "Page must be at least 1 and page_size must be an integer from 1 to 100.",
  );
  return {
    items: items.slice(
      (args.page - 1) * args.page_size,
      args.page * args.page_size,
    ),
    page: args.page,
    page_size: args.page_size,
    total: items.length,
  };
};
export function createMerchantService(deps: ServiceDependencies) {
  const repo = deps.repository,
    clock = deps.clock || (() => new Date()),
    id = deps.id || (() => crypto.randomUUID()),
    now = () => clock().toISOString();
  const readAsset = (file: NonNullable<MerchantRecord["file"]>) => {
    try {
      return deps.assets.read(file);
    } catch {
      throw new BusinessError(
        "ASSET_UNAVAILABLE",
        "Attachment missing or invalid. Check storage or restore a backup.",
      );
    }
  };
  const resolveCuisines = (fact: Fact): Fact => {
    if (fact.value_state !== "known") return fact;
    check(
      Array.isArray(fact.value) &&
        fact.value.every((x) => typeof x === "string" && x.trim()),
      "Cuisines must be a list of non-empty text options.",
    );
    const options = repo.options().filter((o) => o.kind === "cuisine");
    const chosen = (fact.value as string[]).map((value) => {
      const known = options.find((o) => o.id === value || o.label === value);
      if (known) return { id: known.id, label: known.label };
      const term = { id: id(), kind: "cuisine", label: value.trim() };
      repo.saveOption(term);
      options.push(term);
      return { id: term.id, label: term.label };
    });
    return {
      ...fact,
      value: [...new Set(chosen.map((o) => o.id))],
      options: chosen,
    };
  };
  const run = async <T>(fn: () => T): Promise<Result<T>> => {
    try {
      return { ok: true, contract_version: "f1.v2", data: fn() };
    } catch (e) {
      if (e instanceof BusinessError)
        return {
          ok: false,
          contract_version: "f1.v2",
          error: { code: e.code, message: e.message, details: e.details },
        };
      console.error("merchant operation failed", e);
      return {
        ok: false,
        contract_version: "f1.v2",
        error: {
          code: "STORAGE_ERROR",
          message:
            "Operation failed. Check storage and try again. Your changes have not been saved.",
        },
      };
    }
  };
  const read = (args: MerchantQuery) => {
    check(
      typeof args.merchant_id === "string" && args.merchant_id.length > 0,
      "Invalid restaurant ID.",
    );
    if (args.profile_version !== undefined)
      check(
        Number.isInteger(args.profile_version) && args.profile_version > 0,
        "Profile version must be a positive integer.",
      );
    const p = repo.read(args.merchant_id, args.profile_version);
    if (!p) {
      check(
        repo.read(args.merchant_id),
        "Restaurant not found.",
        "MERCHANT_NOT_FOUND",
      );
      throw new BusinessError(
        "PROFILE_VERSION_NOT_FOUND",
        "Profile version not found.",
      );
    }
    return structuredClone(p);
  };
  const dated = (p: Profile, date?: string) => {
    const d = date === undefined ? dayInZone(clock(), timezone(p)) : date;
    check(validDate(d), "As-of date must be a valid YYYY-MM-DD.");
    return { as_of_date: d, timezone: timezone(p) };
  };
  function commit(
    args: VersionCommand,
    type: string,
    edit: (p: Profile) => void,
  ) {
    return repo.transaction(() => {
      const p = read(args);
      check(
        Number.isInteger(args.expected_profile_version) &&
          args.expected_profile_version >= 1,
        "Expected profile version must be a positive integer.",
      );
      check(
        !p.archived ||
          ["archive", "restore_archive", "brand_update"].includes(type),
        "Archived restaurants are read only. Restore before editing.",
      );
      check(
        p.profile_version === args.expected_profile_version,
        "Profile has changed. Reload before saving.",
        "VERSION_CONFLICT",
      );
      const before = structuredClone(p);
      edit(p);
      checkChangedEnglish(before, p);
      if (stable(before) === stable(p)) return p;
      const changes: { path: string; before: unknown; after: unknown }[] = [];
      for (const g of Object.keys(GROUPS) as GroupKey[])
        for (const f of FACT_FIELDS[g])
          if (stable(before.groups[g][f.key]) !== stable(p.groups[g][f.key]))
            changes.push({
              path: g + "." + f.key,
              before: before.groups[g][f.key],
              after: p.groups[g][f.key],
            });
      for (const t of RECORD_NAMES) {
        const old = new Map(before.records[t].map((r) => [r.record_id, r]));
        for (const r of p.records[t]) {
          if (stable(old.get(r.record_id)) !== stable(r))
            changes.push({
              path: t + ":" + r.record_id,
              before: old.get(r.record_id) || null,
              after: r,
            });
          old.delete(r.record_id);
        }
        for (const [rid, r] of old)
          changes.push({ path: t + ":" + rid, before: r, after: null });
        if (
          stable(before.collection_states[t]) !== stable(p.collection_states[t])
        )
          changes.push({
            path: "collection:" + t,
            before: before.collection_states[t],
            after: p.collection_states[t],
          });
      }
      for (const k of ["archived", "brand", "brand_id"] as const)
        if (stable(before[k]) !== stable(p[k]))
          changes.push({ path: k, before: before[k], after: p[k] });
      const changedKeys = new Set(changes.map((c) => c.path));
      for (const [key, type] of Object.entries(COLLECTION_FIELDS))
        if (
          changes.some(
            (c) =>
              c.path.startsWith(type + ":") || c.path === "collection:" + type,
          )
        )
          changedKeys.add(key);
      if (
        changedKeys.has("location.longitude") ||
        changedKeys.has("location.latitude")
      )
        changedKeys.add("location.coordinates");
      for (const scene of p.records.scene) {
        if (
          (scene.values.basis_keys as string[]).some((k) =>
            changedKeys.has(k),
          ) &&
          !scene.needs_review
        ) {
          scene.needs_review = true;
          changes.push({
            path: "scene:" + scene.record_id + ".needs_review",
            before: false,
            after: true,
          });
        }
      }
      p.profile_version++;
      p.updated_at = now();
      validateProfile(p);
      repo.save(p, {
        version: p.profile_version,
        at: p.updated_at,
        type,
        changes,
      });
      return p;
    });
  }
  const mergeFact = (
    key: string,
    old: Fact,
    patch: Partial<Fact>,
    valueChange: boolean,
  ) => {
    check(
      patch && typeof patch === "object" && !Array.isArray(patch),
      "Fact patch must be an object.",
    );
    check(
      patch.verification_state === undefined ||
        patch.verification_state === old.verification_state,
      "Use the verification action to change verification status.",
    );
    check(
      patch.verified_at === undefined || patch.verified_at === old.verified_at,
      "Use the verification action to change verification time.",
    );
    const allowed = Object.keys(blankFact(key));
    const next = {
      ...old,
      ...Object.fromEntries(
        Object.entries(patch).filter(
          ([k]) => allowed.includes(k) || ["unit", "currency"].includes(k),
        ),
      ),
      field_key: key,
    } as Fact;
    next.verification_state = valueChange
      ? "unverified"
      : old.verification_state;
    next.verified_at = valueChange ? null : old.verified_at;
    if (next.value_state !== "known") next.value = null;
    return next;
  };
  const target = (p: Profile, key: string): Fact => {
    if (key.includes(":")) {
      const [t, rid] = key.split(":");
      check(RECORD_NAMES.includes(t as RecordType), "Invalid record type.");
      const r = p.records[t as RecordType].find((r) => r.record_id === rid);
      check(r, "Record not found.", "RECORD_NOT_FOUND");
      return r.metadata;
    }
    const [g, k] = key.split(".");
    check(
      Object.hasOwn(GROUPS, g) && p.groups[g as GroupKey][k],
      "Field key not found.",
    );
    return p.groups[g as GroupKey][k];
  };
  const service = {
    getMerchantFieldCatalog: () =>
      run(() => ({
        contract_version: "f1.v2" as const,
        market: MARKET,
        catalog_revision: "us.2026-10",
        timezones: US_TIMEZONES,
        groups: GROUPS,
        fields: Object.fromEntries(
          Object.entries(FACT_FIELDS).map(([group, fields]) => [
            group,
            fields.map((field) => ({
              ...field,
              field_key: group + "." + field.key,
              group_key: group,
              multi: field.kind === "tags",
              publication_default:
                group === "relationship" ? "internal" : "pending",
              prd_ref:
                "M" +
                String(Object.keys(GROUPS).indexOf(group) + 1).padStart(2, "0"),
            })),
          ]),
        ),
        record_types: RECORD_TYPES,
        cuisine_options: repo
          .options()
          .filter((o) => o.kind === "cuisine")
          .map((o) => ({ id: o.id, label: o.label })),
        core_collection_fields: COLLECTION_FIELDS,
        virtual_fact_labels: VIRTUAL_FACT_LABELS,
      })),
    findMerchantDuplicates: (args: {
      name: string;
      address?: string;
      phone?: string;
    }) =>
      run(() => {
        check(
          typeof args.name === "string" &&
            (!args.address || typeof args.address === "string") &&
            (!args.phone || typeof args.phone === "string"),
          "Invalid duplicate-check arguments.",
        );
        const norm = (v: unknown) =>
          String(v || "")
            .replace(/\s+/g, "")
            .toLocaleLowerCase();
        const name = norm(args.name),
          address = norm(args.address),
          phone = norm(args.phone);
        const matches = repo
          .list()
          .map((p) => {
            const n = norm(p.groups.identity.display_name.value),
              a = norm(p.groups.location.address.value);
            const sameName =
                name && n && (n.includes(name) || name.includes(n)),
              sameAddress = address && address === a,
              samePhone =
                phone &&
                p.records.contact.some((c) => norm(c.values.value) === phone);
            return {
              merchant_id: p.merchant_id,
              name: String(p.groups.identity.display_name.value),
              address: String(p.groups.location.address.value),
              archived: p.archived,
              score:
                (sameName ? 1 : 0) +
                (sameAddress ? 2 : 0) +
                (samePhone ? 3 : 0),
            };
          })
          .filter((p) => p.score > 0)
          .sort((a, b) => b.score - a.score);
        return { items: matches.slice(0, 10) };
      }),
    listBrands: () => run(() => repo.brands()),
    createBrand: (
      input: Pick<Brand, "name"> &
        Partial<
          Pick<
            Brand,
            "aliases" | "founded_year" | "description" | "publication_state"
          >
        >,
    ) =>
      run(() =>
        repo.transaction(() => {
          check(
            typeof input.name === "string" && input.name.trim(),
            "Brand name is required.",
          );
          english(input.name, "Brand name");
          english(input.description, "Brand description");
          english(input.founded_year, "Founded year");
          const b: Brand = {
            brand_id: id(),
            brand_version: 1,
            name: input.name.trim(),
            aliases: input.aliases || [],
            founded_year: input.founded_year || "",
            description: input.description || "",
            publication_state: input.publication_state || "pending",
            created_at: now(),
            updated_at: now(),
          };
          check(
            ["public", "pending", "internal"].includes(b.publication_state) &&
              Array.isArray(b.aliases) &&
              b.aliases.every((x) => typeof x === "string"),
            "Invalid brand format.",
          );
          repo.saveBrand(b);
          return b;
        }),
      ),
    updateBrand: (input: {
      brand_id: string;
      expected_brand_version: number;
      name: string;
      aliases: string[];
      founded_year: string;
      description: string;
      publication_state: Brand["publication_state"];
    }) =>
      run(() =>
        repo.transaction(() => {
          const b = repo.brands().find((x) => x.brand_id === input.brand_id);
          check(b, "Brand not found.", "RECORD_NOT_FOUND");
          check(
            b.brand_version === input.expected_brand_version,
            "Brand has changed. Reload before saving.",
            "VERSION_CONFLICT",
          );
          check(
            input.name?.trim() &&
              Array.isArray(input.aliases) &&
              input.aliases.every((x) => typeof x === "string") &&
              ["pending", "public", "internal"].includes(
                input.publication_state,
              ),
            "Invalid brand data.",
          );
          const next = {
            ...b,
            name: input.name.trim(),
            aliases: input.aliases,
            founded_year: input.founded_year,
            description: input.description,
            publication_state: input.publication_state,
          };
          if (b.name !== next.name) english(next.name, "Brand name");
          if (b.description !== next.description)
            english(next.description, "Brand description");
          if (b.founded_year !== next.founded_year)
            english(next.founded_year, "Founded year");
          if (stable(next) === stable(b)) return b;
          next.brand_version++;
          next.updated_at = now();
          repo.saveBrand(next);
          for (const p of repo.list().filter((p) => p.brand_id === b.brand_id))
            commit(
              {
                merchant_id: p.merchant_id,
                expected_profile_version: p.profile_version,
              },
              "brand_update",
              (m) => {
                m.brand = next;
              },
            );
          return next;
        }),
      ),
    createMerchant: (input: CreateInput) =>
      run(() =>
        repo.transaction(() => {
          check(
            typeof input.display_name === "string" &&
              typeof input.region === "string" &&
              typeof input.address === "string" &&
              Array.isArray(input.primary_cuisines) &&
              input.primary_cuisines.every((x) => typeof x === "string"),
            "Invalid restaurant creation input.",
          );
          for (const [key, value] of Object.entries(input))
            if (key !== "new_brand") english(value, key);
          for (const key of ["city", "state", "postal_code"] as const)
            check(
              input[key] === undefined || typeof input[key] === "string",
              `${key} must be text when provided.`,
            );
          check(
            US_TIMEZONES.includes(
              input.timezone as (typeof US_TIMEZONES)[number],
            ),
            "Select the restaurant's U.S. IANA time zone when creating a profile.",
          );
          check(
            input.brand_id === null ||
              (typeof input.brand_id === "string" && input.brand_id.length > 0),
            "Select a brand or explicitly choose an independent restaurant.",
          );
          let brand = input.brand_id
            ? repo.brands().find((b) => b.brand_id === input.brand_id) || null
            : null;
          check(
            !input.brand_id || brand,
            "Brand not found.",
            "RECORD_NOT_FOUND",
          );
          if (input.new_brand) {
            english(input.new_brand.name, "New brand name");
            check(
              !input.brand_id &&
                typeof input.new_brand.name === "string" &&
                input.new_brand.name.trim(),
              "Enter a new brand name without selecting an existing brand.",
            );
            brand = {
              brand_id: id(),
              brand_version: 1,
              name: input.new_brand.name.trim(),
              aliases: [],
              founded_year: "",
              description: "",
              publication_state: "pending",
              created_at: now(),
              updated_at: now(),
            };
            repo.saveBrand(brand);
          }
          const p: Profile = {
            merchant_id: id(),
            profile_version: 1,
            brand_id: brand?.brand_id || null,
            brand,
            created_at: now(),
            updated_at: now(),
            archived: false,
            archived_at: null,
            groups: {} as Profile["groups"],
            records: {} as Profile["records"],
            collection_states: {} as Profile["collection_states"],
          };
          for (const g of Object.keys(GROUPS) as GroupKey[])
            p.groups[g] = Object.fromEntries(
              FACT_FIELDS[g].map((f) => [
                f.key,
                blankFact(g + "." + f.key, g === "relationship"),
              ]),
            );
          for (const t of RECORD_NAMES) {
            p.records[t] = [];
            p.collection_states[t] = {
              value_state: "unknown",
              not_applicable_reason: "",
            };
          }
          const known = (g: GroupKey, k: string, value: Value) => {
            p.groups[g][k] = { ...p.groups[g][k], value_state: "known", value };
          };
          known("identity", "display_name", input.display_name.trim());
          known("location", "region", input.region.trim());
          known("location", "address", input.address.trim());
          known(
            "offering",
            "primary_cuisines",
            input.primary_cuisines.map((x) => x.trim()).filter(Boolean),
          );
          known("operations", "timezone", input.timezone);
          known("location", "country", MARKET.country);
          known("commercial", "currency", MARKET.currency);
          for (const key of ["city", "state", "postal_code"] as const)
            if (input[key]?.trim()) known("location", key, input[key].trim());
          p.groups.offering.primary_cuisines = resolveCuisines(
            p.groups.offering.primary_cuisines,
          );
          validateProfile(p);
          repo.save(p, {
            version: 1,
            at: p.created_at,
            type: "create",
            changes: [{ path: "merchant", before: null, after: p }],
          });
          return p;
        }),
      ),
    listMerchants: (
      args: PageInput & {
        query?: string;
        filters?: {
          archived?: boolean;
          brand_id?: string;
          region?: string;
          cuisine?: string;
          status?: string;
          cooperation_status?: string;
          readiness?: string;
        };
        sort?: "updated" | "created" | "name";
      },
    ) =>
      run(() => {
        let list = repo.list();
        const q = (args.query || "").trim().toLowerCase(),
          f = args.filters || {};
        list = list.filter((p) => {
          if (p.archived !== (f.archived ?? false)) return false;
          if (f.brand_id && p.brand_id !== f.brand_id) return false;
          if (
            f.region &&
            !String(p.groups.location.region.value).includes(f.region)
          )
            return false;
          if (
            f.cuisine &&
            !(p.groups.offering.primary_cuisines.value as string[]).includes(
              f.cuisine,
            ) &&
            !p.groups.offering.primary_cuisines.options?.some(
              (o) => o.label === f.cuisine,
            )
          )
            return false;
          if (
            f.status &&
            (p.groups.operations.status.value || "unknown") !== f.status
          )
            return false;
          if (
            f.cooperation_status &&
            (p.groups.relationship.cooperation_status.value || "unknown") !==
              f.cooperation_status
          )
            return false;
          const state = readiness(p, dayInZone(clock(), timezone(p)));
          if (
            (f.readiness === "core" && !state.core_ready) ||
            (f.readiness === "verified" && !state.geo_verified) ||
            (f.readiness === "incomplete" && state.core_ready)
          )
            return false;
          const text = [
            p.groups.identity.display_name.value,
            p.groups.identity.branch_name.value,
            p.brand?.name,
            p.groups.location.region.value,
            p.groups.location.address.value,
            ...p.records.alias.map((r) => r.values.name),
            ...p.records.former_name.map((r) => r.values.name),
            ...p.records.contact.map((r) => r.values.value),
          ]
            .join(" ")
            .toLowerCase();
          return !q || text.includes(q);
        });
        check(
          !args.sort || ["updated", "created", "name"].includes(args.sort),
          "Invalid sort order.",
        );
        list.sort((a, b) =>
          args.sort === "name"
            ? String(a.groups.identity.display_name.value).localeCompare(
                String(b.groups.identity.display_name.value),
                "en-US",
              )
            : String(
                args.sort === "created" ? b.created_at : b.updated_at,
              ).localeCompare(
                String(args.sort === "created" ? a.created_at : a.updated_at),
              ),
        );
        return paginate(
          list.map((p) => ({
            merchant_id: p.merchant_id,
            profile_version: p.profile_version,
            name: p.groups.identity.display_name.value,
            branch_name: p.groups.identity.branch_name.value,
            address: p.groups.location.address.value,
            region: p.groups.location.region.value,
            brand: p.brand?.name || null,
            status: p.groups.operations.status.value || "unknown",
            cooperation_status:
              p.groups.relationship.cooperation_status.value || "unknown",
            archived: p.archived,
            updated_at: p.updated_at,
            readiness: readiness(p, dayInZone(clock(), timezone(p))),
          })),
          args,
        );
      }),
    getMerchantProfile: (args: ProfileQuery) =>
      run(() => {
        const p = read(args),
          date = dated(p, args.as_of_date),
          out = project(p, args.projection, date.as_of_date);
        return {
          ...out.profile,
          ...date,
          excluded_fields: out.excluded,
          readiness:
            args.projection === "workspace"
              ? readiness(p, date.as_of_date)
              : undefined,
        };
      }),
    getMerchantNames: (args: MerchantQuery) =>
      run(() => {
        const p = read(args);
        return {
          merchant_id: p.merchant_id,
          profile_version: p.profile_version,
          display_name: p.groups.identity.display_name,
          branch_name: p.groups.identity.branch_name,
          brand: p.brand,
          aliases: p.records.alias,
          former_names: p.records.former_name,
          collection_state: p.collection_states.alias,
        };
      }),
    getMerchantFacts: (
      args: MerchantQuery & {
        field_keys?: string[];
        verified_only: boolean;
        as_of_date?: string;
      },
    ) =>
      run(() => {
        check(
          typeof args.verified_only === "boolean",
          "Explicitly select verified_only.",
        );
        const p = read(args),
          date = dated(p, args.as_of_date);
        const all: Fact<unknown>[] = Object.values(p.groups).flatMap((g) =>
          Object.values(g),
        );
        const collections = COLLECTION_FIELDS;
        for (const [key, type] of Object.entries(collections)) {
          const records = p.records[type];
          all.push({
            ...blankFact(key),
            value_state: p.collection_states[type].value_state,
            value:
              p.collection_states[type].value_state === "known"
                ? records
                : null,
            verification_state:
              records.length > 0 &&
              records.every(
                (r) =>
                  r.metadata.verification_state === "verified" &&
                  validOn(r.metadata, date.as_of_date) &&
                  (!r.values.valid_from ||
                    String(r.values.valid_from) <= date.as_of_date) &&
                  (!r.values.valid_to ||
                    String(r.values.valid_to) >= date.as_of_date),
              )
                ? "verified"
                : "unverified",
            not_applicable_reason:
              p.collection_states[type].not_applicable_reason,
          });
        }
        all.push({
          ...blankFact("location.coordinates"),
          value_state: p.groups.location.longitude.value_state,
          value:
            p.groups.location.longitude.value_state === "known"
              ? {
                  longitude: p.groups.location.longitude.value,
                  latitude: p.groups.location.latitude.value,
                  coordinate_system: p.groups.location.coordinate_system.value,
                }
              : null,
          verification_state:
            p.groups.location.longitude.verification_state === "verified" &&
            p.groups.location.latitude.verification_state === "verified" &&
            validOn(p.groups.location.longitude, date.as_of_date) &&
            validOn(p.groups.location.latitude, date.as_of_date)
              ? "verified"
              : "unverified",
        });
        if (args.field_keys)
          check(
            Array.isArray(args.field_keys) &&
              args.field_keys.every((k) => all.some((f) => f.field_key === k)),
            "Request contains undefined field keys.",
          );
        const selected = all.filter(
            (f) => !args.field_keys || args.field_keys.includes(f.field_key),
          ),
          facts: Fact<unknown>[] = [],
          excluded: { field_key: string; reason: string }[] = [];
        for (const f of selected)
          if (
            args.verified_only &&
            (f.value_state !== "known" ||
              f.verification_state !== "verified" ||
              !validOn(f as Fact, date.as_of_date))
          )
            excluded.push({
              field_key: f.field_key,
              reason: "not_currently_verified",
            });
          else facts.push(f);
        return {
          merchant_id: p.merchant_id,
          profile_version: p.profile_version,
          ...date,
          facts,
          excluded_fields: excluded,
        };
      }),
    listMerchantRecords: (
      args: MerchantQuery &
        PageInput & {
          group_key: GroupKey | "scene_tags";
          record_type: RecordType;
          projection: Projection;
          as_of_date?: string;
        },
    ) =>
      run(() => {
        check(
          RECORD_NAMES.includes(args.record_type) &&
            recordDefinition(args.record_type).group === args.group_key,
          "Invalid section and record type combination.",
        );
        check(
          args.profile_version !== undefined,
          "Paginated record reads require a fixed profile version.",
        );
        const p = read(args),
          date = dated(p, args.as_of_date),
          out = project(p, args.projection, date.as_of_date);
        return {
          merchant_id: p.merchant_id,
          profile_version: p.profile_version,
          ...date,
          ...paginate(out.profile.records[args.record_type], args),
          collection_state: out.profile.collection_states[args.record_type],
          excluded_fields: out.excluded.filter((e) =>
            e.field_key.startsWith(args.record_type + ":"),
          ),
        };
      }),
    listChannelSnapshots: (
      args: MerchantQuery &
        PageInput & {
          channel_id?: string;
          time_range?: { from: string; to: string };
        },
    ) =>
      run(() => {
        const p = read(args);
        if (args.channel_id)
          check(
            p.records.channel.some((r) => r.record_id === args.channel_id),
            "Listing is missing or belongs to another restaurant.",
            "OWNERSHIP_MISMATCH",
          );
        if (args.time_range)
          check(
            timestamp(args.time_range.from) &&
              timestamp(args.time_range.to) &&
              Date.parse(args.time_range.from) <=
                Date.parse(args.time_range.to),
            "Invalid time range.",
          );
        const records = p.records.snapshot.filter(
          (r) =>
            (!args.channel_id || r.values.channel_id === args.channel_id) &&
            (!args.time_range ||
              (Date.parse(String(r.values.collected_at)) >=
                Date.parse(args.time_range.from) &&
                Date.parse(String(r.values.collected_at)) <=
                  Date.parse(args.time_range.to))),
        );
        return {
          merchant_id: p.merchant_id,
          profile_version: p.profile_version,
          ...paginate(records, args),
        };
      }),
    getMerchantEvidence: (args: MerchantQuery & { evidence_id: string }) =>
      run(() => {
        check(
          args.profile_version !== undefined,
          "Evidence reads require a fixed profile version.",
        );
        const p = read(args),
          r = p.records.evidence.find((r) => r.record_id === args.evidence_id);
        check(
          r,
          "Evidence is not present in this version.",
          "RECORD_NOT_FOUND",
        );
        return {
          merchant_id: p.merchant_id,
          profile_version: p.profile_version,
          evidence: r,
        };
      }),
    getMerchantAsset: (
      args: MerchantQuery & {
        asset_id: string;
        projection: Projection;
        as_of_date?: string;
      },
    ) =>
      run(() => {
        check(
          args.profile_version !== undefined,
          "Asset reads require a fixed profile version.",
        );
        const p = read(args),
          date = dated(p, args.as_of_date);
        check(
          p.records.asset.some((r) => r.record_id === args.asset_id),
          "Asset is not present in this version.",
          "RECORD_NOT_FOUND",
        );
        const r = project(
          p,
          args.projection,
          date.as_of_date,
        ).profile.records.asset.find((r) => r.record_id === args.asset_id);
        check(
          r?.file,
          "Asset is unreadable or excluded from the selected projection.",
          "ASSET_UNAVAILABLE",
        );
        readAsset(r.file);
        return {
          merchant_id: p.merchant_id,
          profile_version: p.profile_version,
          ...date,
          asset: r,
          read_handle: {
            asset_id: r.record_id,
            profile_version: p.profile_version,
            projection: args.projection,
          },
        };
      }),
    readMerchantAsset: (
      args: MerchantQuery & {
        asset_id: string;
        projection: Projection;
        as_of_date?: string;
      },
    ) =>
      run(() => {
        check(
          args.profile_version !== undefined,
          "Asset reads require a fixed version.",
        );
        const p = read(args),
          date = dated(p, args.as_of_date),
          r = project(
            p,
            args.projection,
            date.as_of_date,
          ).profile.records.asset.find((r) => r.record_id === args.asset_id);
        check(
          r?.file,
          "Asset is unavailable in this version or projection.",
          "ASSET_UNAVAILABLE",
        );
        return {
          merchant_id: p.merchant_id,
          profile_version: p.profile_version,
          file: r.file,
          bytes: readAsset(r.file),
        };
      }),
    saveGroup: (
      args: VersionCommand & {
        group_key: GroupKey;
        fields: Record<string, Partial<Fact>>;
        brand_id?: string | null;
      },
    ) =>
      run(() =>
        commit(args, "edit_group", (p) => {
          check(
            Object.hasOwn(GROUPS, args.group_key),
            "Invalid profile section.",
          );
          check(
            args.fields &&
              typeof args.fields === "object" &&
              !Array.isArray(args.fields),
            "Invalid field input.",
          );
          for (const [key, inputPatch] of Object.entries(args.fields)) {
            check(
              inputPatch &&
                typeof inputPatch === "object" &&
                !Array.isArray(inputPatch),
              "Fact patch must be an object.",
            );
            check(
              FACT_FIELDS[args.group_key].some((f) => f.key === key),
              `Field ${key} is undefined`,
            );
            const old = p.groups[args.group_key][key];
            const patch =
              args.group_key === "offering" &&
              ["primary_cuisines", "secondary_cuisines"].includes(key)
                ? resolveCuisines({ ...old, ...inputPatch })
                : inputPatch;
            const changed =
              stable(old.value) !==
                stable(patch.value === undefined ? old.value : patch.value) ||
              old.value_state !== (patch.value_state || old.value_state);
            p.groups[args.group_key][key] = mergeFact(
              args.group_key + "." + key,
              old,
              patch,
              changed,
            );
          }
          if (args.brand_id !== undefined) {
            check(
              args.group_key === "identity",
              "Brand association can only be edited in the identity section.",
            );
            const brand = args.brand_id
              ? repo.brands().find((b) => b.brand_id === args.brand_id)
              : null;
            check(
              !args.brand_id || brand,
              "Brand not found.",
              "RECORD_NOT_FOUND",
            );
            p.brand_id = args.brand_id;
            p.brand = brand || null;
          }
          if (args.group_key === "identity") {
            const opening = p.groups.identity.opening_date;
            if (
              opening.value_state === "known" &&
              typeof opening.value === "string"
            )
              opening.precision =
                opening.value.length === 4
                  ? "year"
                  : opening.value.length === 7
                    ? "month"
                    : "day";
            else delete opening.precision;
          }
          if (args.group_key === "offering")
            for (const key of ["primary_cuisines", "secondary_cuisines"])
              p.groups.offering[key] = resolveCuisines(p.groups.offering[key]);
          if (args.group_key === "commercial")
            for (const key of ["average_spend", "average_spend_max"]) {
              const f = p.groups.commercial[key];
              if (f.value_state === "known") {
                const currency = String(
                  p.groups.commercial.currency.value || "",
                );
                if (f.currency !== currency) {
                  f.currency = currency;
                  f.verification_state = "unverified";
                  f.verified_at = null;
                }
                f.unit = "person";
              }
            }
        }),
      ),
    saveRecord: (args: VersionCommand & RecordInput) =>
      run(() =>
        commit(args, "edit_record", (p) => {
          check(
            RECORD_NAMES.includes(args.record_type),
            "Invalid record type.",
          );
          const list = p.records[args.record_type],
            old = args.record_id
              ? list.find((r) => r.record_id === args.record_id)
              : undefined;
          check(
            !args.record_id || old,
            "Record is missing or belongs to another restaurant.",
            "RECORD_NOT_FOUND",
          );
          check(
            !old || !recordDefinition(args.record_type).immutable,
            "Original snapshots cannot be overwritten. Add a correction instead.",
          );
          check(
            args.record_type !== "asset" || old,
            "Assets must be created through the upload action.",
          );
          const values = structuredClone(args.values);
          check(
            values && typeof values === "object" && !Array.isArray(values),
            "Invalid record values.",
          );
          for (const f of recordDefinition(args.record_type).fields)
            if (
              f.kind === "number" &&
              /amount/.test(f.key) &&
              values[f.key] !== undefined
            )
              check(
                typeof values[f.key] === "string",
                "Amounts must use decimal strings, not floating-point numbers.",
              );
          const rid = old?.record_id || id(),
            metadata = mergeFact(
              args.record_type + ":" + rid,
              old?.metadata || {
                ...blankFact(
                  args.record_type + ":" + rid,
                  args.record_type === "person" ||
                    args.record_type === "agreement" ||
                    args.record_type === "communication",
                ),
                value_state: "known",
                value: true,
              },
              args.metadata || {},
              !old || stable(old.values) !== stable(values),
            );
          const r: MerchantRecord = {
            record_id: rid,
            merchant_id: p.merchant_id,
            record_type: args.record_type,
            values,
            metadata,
            created_at: old?.created_at || now(),
            updated_at: old?.updated_at || now(),
            ...(old?.file ? { file: old.file } : {}),
            ...(args.record_type === "scene"
              ? { needs_review: false, based_on_version: p.profile_version }
              : {}),
          };
          if (
            old &&
            stable({ ...old, updated_at: "" }) ===
              stable({ ...r, updated_at: "" })
          )
            return;
          r.updated_at = now();
          if (old) list[list.indexOf(old)] = r;
          else list.push(r);
          p.collection_states[args.record_type] = {
            value_state: "known",
            not_applicable_reason: "",
          };
        }),
      ),
    removeRecord: (
      args: VersionCommand & { record_type: RecordType; record_id: string },
    ) =>
      run(() =>
        commit(args, "remove_record", (p) => {
          check(
            RECORD_NAMES.includes(args.record_type),
            "Invalid record type.",
          );
          check(
            !["snapshot", "asset"].includes(args.record_type),
            "Snapshots cannot be deleted. Disable assets instead of deleting them.",
          );
          check(
            p.records[args.record_type].some(
              (r) => r.record_id === args.record_id,
            ),
            "Record not found.",
            "RECORD_NOT_FOUND",
          );
          p.records[args.record_type] = p.records[args.record_type].filter(
            (r) => r.record_id !== args.record_id,
          );
        }),
      ),
    setCollectionState: (
      args: VersionCommand & {
        record_type: RecordType;
        state: Profile["collection_states"][RecordType];
      },
    ) =>
      run(() =>
        commit(args, "collection_state", (p) => {
          check(
            RECORD_NAMES.includes(args.record_type),
            "Invalid record type.",
          );
          p.collection_states[args.record_type] = args.state;
        }),
      ),
    verifyFacts: (
      args: VersionCommand & {
        targets: string[];
        state: "verified" | "unverified" | "disputed";
        source_note: string;
        verified_at: string | null;
        note?: string;
        evidence_ids?: string[];
        collected_at?: string | null;
      },
    ) =>
      run(() =>
        commit(args, "verification", (p) => {
          check(
            Array.isArray(args.targets) && args.targets.length > 0,
            "Select facts or complete records to verify.",
          );
          check(
            ["verified", "unverified", "disputed"].includes(args.state),
            "Invalid verification status.",
          );
          for (const key of args.targets) {
            const f = target(p, key);
            f.verification_state = args.state;
            f.verified_at = args.state === "verified" ? args.verified_at : null;
            if (args.source_note !== undefined)
              f.source_note = args.source_note;
            if (args.note !== undefined) f.note = args.note;
            if (args.evidence_ids) f.evidence_ids = args.evidence_ids;
            if (args.collected_at !== undefined)
              f.collected_at = args.collected_at;
          }
        }),
      ),
    setPublication: (
      args: VersionCommand & {
        targets: string[];
        publication_state: Fact["publication_state"];
      },
    ) =>
      run(() =>
        commit(args, "publication", (p) => {
          check(
            Array.isArray(args.targets) && args.targets.length > 0,
            "Select facts or records.",
          );
          for (const key of args.targets) {
            const f = target(p, key);
            f.publication_state = args.publication_state;
          }
        }),
      ),
    archiveMerchant: (args: VersionCommand & { archived: boolean }) =>
      run(() =>
        commit(args, args.archived ? "archive" : "restore_archive", (p) => {
          check(typeof args.archived === "boolean", "Invalid archive state.");
          if (p.archived === args.archived) return;
          p.archived = args.archived;
          p.archived_at = args.archived ? now() : null;
        }),
      ),
    getMerchantHistory: (args: MerchantQuery) =>
      run(() => {
        const p = read(args);
        return {
          merchant_id: p.merchant_id,
          profile_version: p.profile_version,
          changes: repo.history(p.merchant_id),
        };
      }),
    uploadMerchantAsset: (
      args: VersionCommand & {
        name: string;
        mime: string;
        bytes: Uint8Array;
        category: string;
        publication_state?: Fact["publication_state"];
      },
    ) =>
      run(() => {
        check(
          typeof args.category === "string" && args.category.trim(),
          "Asset uploads require a category / purpose.",
        );
        check(
          args.bytes instanceof Uint8Array &&
            args.bytes.length > 0 &&
            args.bytes.length <= (deps.assets.max_bytes || 50 * 1024 * 1024),
          "Attachment is empty or exceeds the configured size limit.",
        );
        check(
          typeof args.name === "string" && args.name.trim(),
          "Attachment name is required.",
        );
        const current = read(args);
        check(
          !current.archived,
          "Restore an archived restaurant before uploading attachments.",
        );
        check(
          current.profile_version === args.expected_profile_version,
          "Profile has changed. Reload before continuing.",
          "VERSION_CONFLICT",
        );
        const file = deps.assets.put(args.bytes, {
          name: args.name,
          mime: args.mime,
        });
        return commit(args, "upload_asset", (p) => {
          const rid = id();
          p.records.asset.push({
            record_id: rid,
            merchant_id: p.merchant_id,
            record_type: "asset",
            values: {
              name: args.name,
              category: args.category,
              usage: "active",
            },
            metadata: {
              ...blankFact("asset:" + rid),
              value_state: "known",
              value: true,
              publication_state:
                /\b(contract|agreement|internal evidence)\b/i.test(
                  args.category,
                ) ||
                ["\u5408\u540c", "\u5185\u90e8\u8bc1\u636e"].includes(
                  args.category,
                )
                  ? "internal"
                  : args.publication_state || "pending",
            },
            file,
            created_at: now(),
            updated_at: now(),
          });
          p.collection_states.asset = {
            value_state: "known",
            not_applicable_reason: "",
          };
        });
      }),
    exportMerchant: (
      args: MerchantQuery & { as_of_date?: string; asset_ids?: string[] },
    ) =>
      run(() => {
        const p = read(args),
          date = dated(p, args.as_of_date),
          out = project(p, "publishable", date.as_of_date);
        const selected = args.asset_ids || [];
        check(
          Array.isArray(selected) &&
            selected.every((id) =>
              out.profile.records.asset.some((a) => a.record_id === id),
            ),
          "Selected asset is not part of this restaurant version or is not public.",
        );
        out.profile.records.asset = out.profile.records.asset.filter((a) =>
          selected.includes(a.record_id),
        );
        for (const type of RECORD_NAMES)
          for (const r of out.profile.records[type]) {
            for (const field of recordDefinition(type).fields)
              if (field.ref === "asset") {
                const value = r.values[field.key];
                if (Array.isArray(value))
                  r.values[field.key] = (value as string[]).filter((id) =>
                    selected.includes(id),
                  );
                else if (typeof value === "string" && !selected.includes(value))
                  delete r.values[field.key];
              }
          }
        const json = { ...out.profile, ...date, excluded_fields: out.excluded };
        const lines = [
          "# Public restaurant profile",
          `Profile version: ${p.profile_version} · As of: ${date.as_of_date} · Time zone: ${date.timezone}`,
          "",
        ];
        const render = (value: unknown, options?: Fact["options"]): string => {
          if (options && Array.isArray(value))
            return value
              .map(
                (id) => options.find((o) => o.id === id)?.label || String(id),
              )
              .join(", ");
          if (
            Array.isArray(value) &&
            value.length &&
            typeof value[0] === "object" &&
            "day" in value[0]
          )
            return (value as import("./types").DayHours[])
              .map(
                (day) =>
                  `${WEEKDAYS[day.day - 1]}: ${day.mode === "closed" ? "Closed" : day.mode === "all_day" ? "Open 24 hours" : day.mode === "unknown" ? "Unknown" : day.periods.map((p) => `${p.start}–${p.end}${p.end_day_offset ? " (+1 day)" : ""}${p.last_order ? ` (last order ${p.last_order}${p.last_order_day_offset ? " +1 day" : ""})` : ""}`).join("; ")}`,
              )
              .join("; ");
          return Array.isArray(value)
            ? value.join(", ")
            : typeof value === "boolean"
              ? value
                ? "Yes"
                : "No"
              : String(value ?? "");
        };
        for (const [g, fields] of Object.entries(out.profile.groups)) {
          const defs = FACT_FIELDS[g as GroupKey];
          if (Object.keys(fields).length)
            lines.push("## " + GROUPS[g as GroupKey]);
          for (const [k, f] of Object.entries(fields))
            lines.push(
              `- ${defs.find((x) => x.key === k)?.label || k}: ${render(f.value, f.options)}${f.currency ? " " + f.currency : ""}${f.unit ? " / " + f.unit : ""} (${f.verification_state === "verified" ? "Verified" : f.verification_state === "disputed" ? "Disputed" : "Unverified"})`,
            );
        }
        for (const type of RECORD_NAMES)
          if (out.profile.records[type].length) {
            lines.push("## " + recordDefinition(type).label);
            for (const r of out.profile.records[type]) {
              lines.push(
                `### ${String(r.values.name || r.values.subject || r.values.value || recordDefinition(type).label)}`,
              );
              for (const field of recordDefinition(type).fields) {
                let value = r.values[field.key];
                if (value === undefined) continue;
                if (field.ref) {
                  const target = field.ref.startsWith("$")
                    ? String(r.values[field.ref.slice(1)])
                    : field.ref;
                  const ids = Array.isArray(value)
                    ? (value as string[])
                    : [String(value)];
                  value = ids.map((id) => {
                    const ref = out.profile.records[target as RecordType]?.find(
                      (x) => x.record_id === id,
                    );
                    return ref
                      ? String(
                          ref.values.name || ref.values.value || ref.record_id,
                        )
                      : id;
                  });
                }
                lines.push(`- ${field.label}: ${render(value)}`);
              }
            }
          }
        return { json, markdown: lines.join("\n") };
      }),
  };
  return {
    ...service,
    recordChannelSnapshot: (
      args: VersionCommand & Omit<RecordInput, "record_type">,
    ) => service.saveRecord({ ...args, record_type: "snapshot" }),
  };
}
export type MerchantService = ReturnType<typeof createMerchantService>;
