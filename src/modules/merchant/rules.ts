import {
  FACT_FIELDS,
  COLLECTION_FIELDS,
  GROUPS,
  RECORD_TYPES,
  RECORD_NAMES,
  recordDefinition,
  type FieldDefinition,
  type GroupKey,
  type RecordType,
} from "./catalog";
import type {
  Fact,
  Profile,
  Value,
  DayHours,
  Period,
  ErrorCode,
  MerchantRecord,
  Projection,
} from "./types";
import { hasNonLatinLetters, isOriginalSourceField } from "./us-market";
export class BusinessError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
export function check(
  condition: unknown,
  message: string,
  code: ErrorCode = "INVALID_ARGUMENT",
): asserts condition {
  if (!condition) throw new BusinessError(code, message);
}
export const blankFact = (key: string, internal = false): Fact => ({
  field_key: key,
  value_state: "unknown",
  value: null,
  verification_state: "unverified",
  publication_state: internal ? "internal" : "pending",
  source_type: "manual_input",
  source_note: "",
  collected_at: null,
  verified_at: null,
  valid_from: null,
  valid_to: null,
  evidence_ids: [],
  note: "",
  not_applicable_reason: "",
});
/** Absent additive catalog fields retain an explicit unknown state. */
export function hydrateProfile(input: Profile): Profile {
  const p = structuredClone(input);
  check(
    p && p.groups && p.records && p.collection_states,
    "Profile snapshot structure is incomplete.",
  );
  for (const g of Object.keys(GROUPS) as GroupKey[]) {
    p.groups[g] ??= {};
    for (const def of FACT_FIELDS[g])
      p.groups[g][def.key] ??= blankFact(
        g + "." + def.key,
        g === "relationship",
      );
  }
  for (const t of RECORD_NAMES) {
    p.records[t] ??= [];
    p.collection_states[t] ??= {
      value_state: "unknown",
      not_applicable_reason: "",
    };
  }
  const opening = p.groups.identity.opening_date;
  if (opening.value_state === "known" && typeof opening.value === "string")
    opening.precision =
      opening.value.length === 4
        ? "year"
        : opening.value.length === 7
          ? "month"
          : "day";
  return p;
}
export function dayInZone(time: Date, zone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(time);
}
export const timezone = (p: Profile) =>
  String(p.groups.operations.timezone.value || "Etc/UTC");
export function validDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + "T00:00:00Z");
  return !isNaN(+d) && d.toISOString().slice(0, 10) === v;
}
export function timestamp(v: unknown) {
  return (
    typeof v === "string" &&
    /T.*(Z|[+-]\d{2}:\d{2})$/.test(v) &&
    !isNaN(Date.parse(v))
  );
}
export function validOn(f: Fact, date: string) {
  return (
    (!f.valid_from || f.valid_from <= date) &&
    (!f.valid_to || f.valid_to >= date)
  );
}
const mins = (s: string) => {
  check(
    /^([01]\d|2[0-3]):[0-5]\d$/.test(s),
    "Time must use HH:mm (24-hour format).",
  );
  return Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
};
export function compareDecimal(a: unknown, b: unknown) {
  const parts = (v: unknown) => {
    const [integer, fraction = ""] = String(v).split(".");
    return [integer.replace(/^0+(?=\d)/, ""), fraction.replace(/0+$/, "")];
  };
  const [ai, af] = parts(a),
    [bi, bf] = parts(b);
  if (ai.length !== bi.length) return ai.length - bi.length;
  if (ai !== bi) return ai < bi ? -1 : 1;
  const width = Math.max(af.length, bf.length),
    ap = af.padEnd(width, "0"),
    bp = bf.padEnd(width, "0");
  return ap === bp ? 0 : ap < bp ? -1 : 1;
}
export function validatePeriods(periods: Period[]) {
  check(Array.isArray(periods) && periods.length > 0, "Enter opening hours.");
  const slots = periods
    .map((p) => {
      check(
        p.end_day_offset === 0 || p.end_day_offset === 1,
        "End-day offset must be 0 or 1.",
      );
      const a = mins(p.start),
        b = mins(p.end) + p.end_day_offset * 1440;
      check(
        b > a && b - a <= 1440,
        "Closing time must follow opening time. Select next day for overnight hours.",
      );
      if (p.last_order) {
        const c = mins(p.last_order) + (p.last_order_day_offset || 0) * 1440;
        check(c >= a && c <= b, "Last order must fall within opening hours.");
      }
      return [a, b];
    })
    .sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < slots.length; i++)
    check(slots[i][0] >= slots[i - 1][1], "Opening periods must not overlap.");
  return slots;
}
export function parsePeriods(value: string): Period[] {
  return value
    .split(",")
    .filter(Boolean)
    .map((s) => {
      const m = s.trim().match(/^(\d{2}:\d{2})-(\d{2}:\d{2})(\+1)?$/);
      check(m, "Use hours such as 09:00-14:00,17:00-02:00+1.");
      return { start: m[1], end: m[2], end_day_offset: m[3] ? 1 : 0 };
    });
}
export function validateHours(value: Value) {
  check(
    Array.isArray(value) && value.length === 7,
    "Weekly hours must include all seven days.",
  );
  const days = value as DayHours[];
  check(
    new Set(days.map((x) => x.day)).size === 7 &&
      days.every((x) => Number.isInteger(x.day) && x.day >= 1 && x.day <= 7),
    "Days must be unique integers from 1 (Monday) to 7 (Sunday).",
  );
  const spans: number[][] = [];
  for (const d of days) {
    check(
      ["unknown", "closed", "all_day", "periods"].includes(d.mode),
      "Invalid hours mode.",
    );
    check(Array.isArray(d.periods), "Invalid hours format.");
    if (d.mode === "periods")
      for (const [a, b] of validatePeriods(d.periods))
        spans.push([(d.day - 1) * 1440 + a, (d.day - 1) * 1440 + b]);
    else {
      check(
        !d.periods.length,
        "Closed and 24-hour days cannot include opening periods.",
      );
      if (d.mode === "all_day") spans.push([(d.day - 1) * 1440, d.day * 1440]);
    }
  }
  const loop = spans
    .flatMap((x) => [x, [x[0] + 10080, x[1] + 10080]])
    .sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < loop.length; i++)
    check(
      loop[i][0] >= loop[i - 1][1],
      "Overnight hours overlap an adjacent day.",
    );
}
export function validateValue(def: FieldDefinition, value: Value) {
  check(
    value !== null && value !== undefined,
    `${def.label} requires a known value`,
  );
  if (def.kind === "hours") {
    validateHours(value);
    return;
  }
  if (def.kind === "tags") {
    check(
      Array.isArray(value) &&
        value.every((x) => typeof x === "string" && x.trim()),
      `${def.label} must be a list of text values`,
    );
    if (def.required) check(value.length > 0, `${def.label} is required`);
    return;
  }
  if (def.kind === "boolean") {
    check(typeof value === "boolean", `${def.label} must be Yes or No`);
    return;
  }
  if (def.kind === "number" || def.kind === "integer") {
    if (/amount|average_spend/.test(def.key))
      check(
        typeof value === "string" && /^\d+(\.\d+)?$/.test(value),
        `${def.label} must be a non-negative decimal amount string`,
      );
    check(
      (typeof value === "number" || typeof value === "string") &&
        String(value).trim() !== "" &&
        Number.isFinite(Number(value)),
      `${def.label} must be a number`,
    );
    if (def.kind === "integer")
      check(
        Number.isInteger(Number(value)) && Number(value) >= 0,
        `${def.label} must be a non-negative integer`,
      );
    else if (!["longitude", "latitude"].includes(def.key))
      check(Number(value) >= 0, `${def.label} cannot be negative`);
    if (/[Aa]mount|average_spend/.test(def.key))
      check(
        /^\d+(\.\d+)?$/.test(String(value)),
        `${def.label} must be a decimal amount`,
      );
    return;
  }
  check(typeof value === "string", `${def.label} must be text`);
  check(value.trim().length > 0, `${def.label} cannot be an empty known value`);
  if (def.required) check(value.trim(), `${def.label} is required`);
  if (def.kind === "date")
    check(validDate(value), `${def.label} has an invalid date`);
  if (def.kind === "datetime")
    check(
      timestamp(value),
      `${def.label} must include a UTC offset, for example 2026-10-19T09:00:00-04:00`,
    );
  if (def.kind === "url") {
    let good = false;
    try {
      good = ["http:", "https:"].includes(new URL(value).protocol);
    } catch {}
    check(good, `${def.label} must be an HTTP/HTTPS URL`);
  }
  if (def.options)
    check(def.options.includes(value), `${def.label} has an invalid option`);
  if (def.key === "postal_code")
    check(
      /^\d{5}(-\d{4})?$/.test(value),
      "ZIP Code must be 5 digits or ZIP+4 (12345-6789).",
    );
}
export function validateFact(f: Fact, internal: boolean) {
  check(
    ["known", "unknown", "not_applicable"].includes(f.value_state),
    "Invalid value status.",
  );
  check(
    ["unverified", "verified", "disputed"].includes(f.verification_state),
    "Invalid verification status.",
  );
  check(
    ["public", "internal", "pending"].includes(f.publication_state),
    "Invalid visibility.",
  );
  if (internal)
    check(
      f.publication_state === "internal",
      "Client service records must remain internal.",
    );
  if (f.value_state !== "known")
    check(
      f.value === null && f.verification_state !== "verified",
      "Unknown or inapplicable facts cannot have a value or be verified.",
    );
  if (f.value_state === "not_applicable")
    check(
      f.not_applicable_reason?.trim(),
      "Enter a reason this does not apply.",
    );
  if (f.verification_state === "verified")
    check(
      f.source_note?.trim() && timestamp(f.verified_at),
      "Verified facts require source notes and a verification timestamp with a UTC offset.",
    );
  if (f.verification_state === "disputed")
    check(f.note?.trim(), "Disputed facts require an explanation.");
  check(
    Array.isArray(f.evidence_ids) &&
      f.evidence_ids.every((x) => typeof x === "string"),
    "Invalid evidence IDs.",
  );
  for (const key of [
    "source_type",
    "source_note",
    "note",
    "not_applicable_reason",
  ] as const)
    check(typeof f[key] === "string", "Invalid fact metadata.");
  for (const t of [f.collected_at, f.verified_at])
    if (t !== null)
      check(
        timestamp(t),
        "Collection and verification timestamps must include a UTC offset.",
      );
  for (const d of [f.valid_from, f.valid_to])
    if (d !== null) check(validDate(d), "Invalid validity date.");
  if (f.valid_from && f.valid_to)
    check(
      f.valid_from <= f.valid_to,
      "Valid-from date must not follow valid-through date.",
    );
}
export function validateProfile(p: Profile) {
  check(
    typeof p.merchant_id === "string" &&
      Number.isInteger(p.profile_version) &&
      p.profile_version >= 1,
    "Invalid restaurant ID or profile version.",
  );
  check(
    Object.keys(p.groups).every((g) => Object.hasOwn(GROUPS, g)),
    "Profile contains an undefined section.",
  );
  check(
    Object.keys(p.records).every((t) => RECORD_NAMES.includes(t as RecordType)),
    "Profile contains an undefined record type.",
  );
  for (const group of Object.keys(GROUPS) as GroupKey[]) {
    check(
      Object.keys(p.groups[group]).every((k) =>
        FACT_FIELDS[group].some((f) => f.key === k),
      ),
      "Profile contains an undefined field.",
    );
    for (const def of FACT_FIELDS[group]) {
      const fact = p.groups[group][def.key];
      validateFact(fact, group === "relationship");
      if (def.required)
        check(fact.value_state === "known", `${def.label} is required`);
      if (fact.value_state === "known") validateValue(def, fact.value);
    }
  }
  const loc = p.groups.location;
  check(
    (loc.longitude.value_state === "known") ===
      (loc.latitude.value_state === "known"),
    "Enter both latitude and longitude.",
  );
  if (loc.longitude.value_state === "known") {
    check(
      Math.abs(Number(loc.longitude.value)) <= 180 &&
        Math.abs(Number(loc.latitude.value)) <= 90,
      "Coordinates are out of range.",
    );
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone(p) });
  } catch {
    throw new BusinessError("INVALID_ARGUMENT", "Invalid IANA time zone.");
  }
  const week = p.groups.operations.weekly_hours;
  if (week.verification_state === "verified")
    check(
      (week.value as DayHours[]).every((d) => d.mode !== "unknown"),
      "Weekly hours contain unknown days and cannot be verified as a whole.",
    );
  const service = p.groups.service;
  if (
    service.min_guests.value_state === "known" &&
    service.max_guests.value_state === "known"
  )
    check(
      Number(service.min_guests.value) <= Number(service.max_guests.value),
      "Minimum party size must not exceed maximum party size.",
    );
  const opening = p.groups.identity.opening_date;
  if (opening.value_state === "known")
    check(
      /^\d{4}(-\d{2})?(-\d{2})?$/.test(String(opening.value)) &&
        (/^\d{4}$/.test(String(opening.value)) ||
          validDate(
            String(opening.value).length === 7
              ? opening.value + "-01"
              : opening.value,
          )),
      "Opening date must be a valid year, year-month or full date.",
    );
  const commercial = p.groups.commercial;
  if (
    commercial.average_spend.value_state === "known" ||
    commercial.average_spend_max.value_state === "known"
  )
    check(
      commercial.currency.value_state === "known" &&
        /^[A-Z]{3}$/.test(String(commercial.currency.value)),
      "Spend per person requires a three-letter uppercase currency code.",
    );
  if (
    commercial.average_spend.value_state === "known" &&
    commercial.average_spend_max.value_state === "known"
  )
    check(
      compareDecimal(
        commercial.average_spend.value,
        commercial.average_spend_max.value,
      ) <= 0,
      "Minimum spend per person must not exceed the maximum.",
    );
  for (const group of Object.keys(GROUPS) as GroupKey[])
    for (const def of FACT_FIELDS[group]) {
      const fact = p.groups[group][def.key];
      if (def.ref && fact.value_state === "known")
        check(
          p.records[def.ref as RecordType]?.some(
            (x) => x.record_id === fact.value,
          ),
          `${def.label} references a missing object or another restaurant`,
          "OWNERSHIP_MISMATCH",
        );
      for (const e of fact.evidence_ids)
        check(
          p.records.evidence.some((x) => x.record_id === e),
          "Evidence is missing or belongs to another restaurant.",
          "OWNERSHIP_MISMATCH",
        );
    }
  for (const type of RECORD_NAMES) {
    const state = p.collection_states[type];
    check(
      ["known", "unknown", "not_applicable"].includes(state.value_state),
      "Invalid collection status.",
    );
    if (state.value_state === "not_applicable")
      check(
        state.not_applicable_reason?.trim() && !p.records[type].length,
        "A populated collection cannot be inapplicable. An inapplicable collection requires a reason.",
      );
    for (const r of p.records[type]) validateRecord(p, r);
  }
  const exceptions = p.records.date_exception;
  for (let i = 0; i < exceptions.length; i++)
    for (let j = i + 1; j < exceptions.length; j++)
      check(
        String(exceptions[i].values.start_date) >
          String(exceptions[j].values.end_date) ||
          String(exceptions[j].values.start_date) >
            String(exceptions[i].values.end_date),
        "Holiday / special hours overlap. Resolve the conflict first.",
      );
  const prices = p.records.price;
  for (let i = 0; i < prices.length; i++)
    for (let j = i + 1; j < prices.length; j++) {
      const a = prices[i].values,
        b = prices[j].values;
      if (
        a.object_type === b.object_type &&
        a.object_id === b.object_id &&
        String(a.conditions || "") === String(b.conditions || "")
      )
        check(
          String(a.valid_from || "0000") > String(b.valid_to || "9999") ||
            String(b.valid_from || "0000") > String(a.valid_to || "9999"),
          "Prices for the same object and conditions have overlapping validity dates.",
        );
    }
}
function validateRecord(p: Profile, r: MerchantRecord) {
  const def = recordDefinition(r.record_type);
  check(
    r.merchant_id === p.merchant_id,
    "Record belongs to another restaurant.",
    "OWNERSHIP_MISMATCH",
  );
  validateFact(r.metadata, def.group === "relationship");
  for (const key of Object.keys(r.values))
    check(
      def.fields.some((f) => f.key === key),
      `Undefined record field:${key}`,
    );
  for (const field of def.fields) {
    const v = r.values[field.key];
    if (v !== undefined && v !== null) validateValue(field, v);
    else check(!field.required, `${field.label} is required`);
    if (field.ref && v !== undefined && v !== null) {
      const ref = field.ref.startsWith("$")
        ? String(r.values[field.ref.slice(1)])
        : field.ref;
      check(
        RECORD_NAMES.includes(ref as RecordType),
        "Invalid related object type.",
      );
      const ids = Array.isArray(v) ? v : [v];
      for (const id of ids)
        check(
          p.records[ref as RecordType].some((x) => x.record_id === id),
          `${field.label} references a missing record or another restaurant`,
          "OWNERSHIP_MISMATCH",
        );
    }
  }
  for (const e of r.metadata.evidence_ids)
    check(
      p.records.evidence.some((x) => x.record_id === e),
      "Record evidence belongs to another restaurant.",
      "OWNERSHIP_MISMATCH",
    );
  const v = r.values;
  if (v.valid_from && v.valid_to)
    check(
      String(v.valid_from) <= String(v.valid_to),
      "Record valid-from date must not follow valid-through date.",
    );
  if (v.start_date && v.end_date)
    check(
      String(v.start_date) <= String(v.end_date),
      "Start date must not follow end date.",
    );
  if (v.amount_max !== undefined && v.amount !== undefined)
    check(
      compareDecimal(v.amount, v.amount_max) <= 0,
      "Minimum amount must not exceed maximum amount.",
    );
  if (v.ratio !== undefined)
    check(Number(v.ratio) <= 100, "Percentage must not exceed 100.");
  if (r.record_type === "room" && v.recommended !== undefined)
    check(
      Number(v.recommended) <= Number(v.capacity),
      "Recommended party size must not exceed capacity.",
    );
  if (v.amount !== undefined)
    check(
      typeof v.currency === "string" &&
        /^[A-Z]{3}$/.test(v.currency) &&
        typeof v.unit === "string" &&
        v.unit.trim(),
      "Amounts require a three-letter uppercase currency code and pricing unit.",
    );
  if (r.record_type === "dish_spec" && v.quantity !== undefined)
    check(
      typeof v.unit === "string" && v.unit.trim(),
      "Portion quantity requires a unit.",
    );
  if (v.appointment_from && v.appointment_to)
    check(
      String(v.appointment_from) <= String(v.appointment_to),
      "Appointment start date must not follow the end date.",
    );
  if (r.record_type === "date_exception" && v.mode === "periods")
    validatePeriods(parsePeriods(String(v.periods || "")));
  if (r.record_type === "date_exception" && v.mode !== "periods")
    check(
      !v.periods,
      "Closed and 24-hour exceptions cannot include replacement periods.",
    );
  if (r.record_type === "snapshot") {
    if (v.rating !== undefined)
      check(
        Number(v.rating_scale) > 0 &&
          Number(v.rating) <= Number(v.rating_scale),
        "Ratings require a scale maximum and must not exceed it.",
      );
    if (v.corrects_id)
      check(
        p.records.snapshot.find((x) => x.record_id === v.corrects_id)?.values
          .channel_id === v.channel_id,
        "A correction must refer to the same listing.",
      );
  }
  if (r.record_type === "copy")
    check(
      Number(v.based_on_version) >= 1 &&
        Number(v.based_on_version) <= p.profile_version,
      "Referenced profile version does not exist.",
    );
  if (r.record_type === "scene") {
    const keys = v.basis_keys as string[];
    check(
      keys.every(
        (k) =>
          Object.hasOwn(COLLECTION_FIELDS, k) ||
          k === "location.coordinates" ||
          Object.entries(FACT_FIELDS).some(([g, fs]) =>
            fs.some((f) => g + "." + f.key === k),
          ),
      ),
      "Supporting occasion fact key does not exist.",
    );
    if (v.judgment !== "pending")
      check(
        timestamp(v.confirmed_at),
        "Confirmed occasions require a timestamp with a UTC offset.",
      );
  }
}
export function safeMetadata(f: Fact): Fact {
  return {
    field_key: f.field_key,
    ...(f.precision ? { precision: f.precision } : {}),
    ...(f.options ? { options: f.options } : {}),
    value_state: f.value_state,
    value: f.value,
    verification_state: f.verification_state,
    publication_state: "public",
    source_type: "",
    source_note: "",
    collected_at: null,
    verified_at: null,
    valid_from: f.valid_from,
    valid_to: f.valid_to,
    evidence_ids: [],
    note: "",
    not_applicable_reason: "",
    ...(f.unit ? { unit: f.unit } : {}),
    ...(f.currency ? { currency: f.currency } : {}),
  };
}
export function project(p: Profile, projection: Projection, date: string) {
  check(
    ["workspace", "geo_context", "publishable"].includes(projection),
    "Explicitly select a valid read projection.",
  );
  const result = structuredClone(p);
  const excluded: { field_key: string; reason: string }[] = [];
  if (projection === "workspace") return { profile: result, excluded };
  for (const group of Object.keys(GROUPS) as GroupKey[]) {
    for (const [key, f] of Object.entries(result.groups[group])) {
      if (
        group === "relationship" ||
        (projection === "publishable" &&
          (f.publication_state !== "public" ||
            f.value_state !== "known" ||
            !validOn(f, date)))
      ) {
        excluded.push({
          field_key: group + "." + key,
          reason:
            group === "relationship"
              ? "internal_group"
              : !validOn(f, date)
                ? "not_effective"
                : "not_publishable",
        });
        delete result.groups[group][key];
      } else if (projection === "publishable")
        result.groups[group][key] = safeMetadata(f);
    }
  }
  const allowed = new Set<string>();
  for (const type of RECORD_NAMES) {
    const def = recordDefinition(type);
    result.records[type] = result.records[type].filter((r) => {
      const effective =
        validOn(r.metadata, date) &&
        (!r.values.valid_from || String(r.values.valid_from) <= date) &&
        (!r.values.valid_to || String(r.values.valid_to) >= date);
      const keep =
        def.group !== "relationship" &&
        (projection !== "publishable" ||
          (type !== "evidence" &&
            type !== "snapshot" &&
            r.metadata.publication_state === "public" &&
            r.metadata.value_state === "known" &&
            effective &&
            (type !== "asset" || r.values.usage !== "disabled")));
      if (!keep)
        excluded.push({
          field_key: `${type}:${r.record_id}`,
          reason:
            def.group === "relationship"
              ? "internal_group"
              : !effective
                ? "not_effective"
                : "not_publishable",
        });
      else allowed.add(r.record_id);
      return keep;
    });
  }
  if (projection === "publishable") {
    for (const type of RECORD_NAMES)
      for (const r of result.records[type]) {
        r.metadata = safeMetadata(r.metadata);
        if (r.file) {
          r.file = { ...r.file, original_name: "" };
        }
        for (const field of recordDefinition(type).fields)
          if (field.ref) {
            const v = r.values[field.key];
            if (Array.isArray(v))
              r.values[field.key] = (v as string[]).filter((id) =>
                allowed.has(id),
              );
            else if (typeof v === "string" && !allowed.has(v))
              delete r.values[field.key];
          }
      }
    for (const group of Object.keys(GROUPS) as GroupKey[])
      for (const f of FACT_FIELDS[group])
        if (f.ref) {
          const value = result.groups[group][f.key];
          if (
            value &&
            typeof value.value === "string" &&
            !allowed.has(value.value)
          ) {
            delete result.groups[group][f.key];
            excluded.push({
              field_key: group + "." + f.key,
              reason: "referenced_record_not_publishable",
            });
          }
        }
  }
  if (projection === "publishable" && result.brand) {
    if (result.brand.publication_state !== "public") result.brand = null;
    else result.brand = { ...result.brand, created_at: "", updated_at: "" };
  }
  return { profile: result, excluded };
}
export function readiness(p: Profile, date: string) {
  const facts = (Object.keys(GROUPS) as GroupKey[]).flatMap((g) =>
    FACT_FIELDS[g].filter((f) => !f.legacy).map((f) => p.groups[g][f.key]),
  );
  const unknown = facts.filter((f) => f.value_state === "unknown").length,
    unverified = facts.filter(
      (f) => f.value_state === "known" && f.verification_state === "unverified",
    ).length,
    disputed = facts.filter((f) => f.verification_state === "disputed").length,
    expired = facts.filter(
      (f) => f.value_state === "known" && !validOn(f, date),
    ).length;
  const core = [p.groups.operations.status, p.groups.operations.weekly_hours];
  const contacts = p.records.contact;
  const names = p.collection_states.alias.value_state === "known";
  const avg = p.groups.commercial.average_spend;
  const weekComplete =
    p.groups.operations.weekly_hours.value_state === "known" &&
    (p.groups.operations.weekly_hours.value as DayHours[]).every(
      (d) => d.mode !== "unknown",
    );
  const coreReady =
    weekComplete &&
    core.every((f) => f.value_state === "known" && validOn(f, date)) &&
    contacts.length > 0 &&
    ["known", "not_applicable"].includes(avg.value_state) &&
    names;
  const verified =
    [
      p.groups.identity.display_name,
      p.groups.location.address,
      ...core,
      p.groups.offering.primary_cuisines,
    ].every(
      (f) =>
        f.value_state === "known" &&
        f.verification_state === "verified" &&
        validOn(f, date),
    ) &&
    contacts.some(
      (r) =>
        r.metadata.verification_state === "verified" &&
        validOn(r.metadata, date),
    );
  const records = Object.values(p.records).flat();
  const recordExpired = records.filter(
    (r) =>
      !validOn(r.metadata, date) ||
      (r.values.valid_to && String(r.values.valid_to) < date) ||
      (r.values.valid_from && String(r.values.valid_from) > date),
  ).length;
  const tableTotal = p.records.table.reduce(
    (n, r) => n + Number(r.values.seats || 0) * Number(r.values.count || 0),
    0,
  );
  const warnings: string[] = [];
  const englishReview = (Object.keys(GROUPS) as GroupKey[]).flatMap((group) =>
    FACT_FIELDS[group]
      .filter((def) => {
        const fact = p.groups[group][def.key];
        return (
          fact.value_state === "known" &&
          (hasNonLatinLetters(fact.value) ||
            hasNonLatinLetters(fact.options?.map((o) => o.label)))
        );
      })
      .map((def) => `${group}.${def.key}`),
  );
  for (const type of RECORD_NAMES)
    for (const r of p.records[type])
      if (
        Object.entries(r.values).some(
          ([key, value]) =>
            !isOriginalSourceField(type, key) &&
            !(type === "asset" && key === "name" && r.file) &&
            hasNonLatinLetters(value),
        )
      )
        englishReview.push(`${type}:${r.record_id}`);
  if (
    p.brand &&
    (hasNonLatinLetters(p.brand.name) ||
      hasNonLatinLetters(p.brand.description))
  )
    englishReview.push("brand");
  if (englishReview.length)
    warnings.push(
      `${englishReview.length} existing profile items need English review. Original data and historical versions have been preserved.`,
    );
  if (p.groups.location.country.value !== "US")
    warnings.push(
      "This existing profile has not been reviewed for the U.S. market. Confirm its address, currency, units and time zone explicitly.",
    );
  if (
    p.groups.space.seats.value_state === "known" &&
    p.records.table.length &&
    tableTotal !== Number(p.groups.space.seats.value)
  )
    warnings.push(
      "Table seat totals differ from total capacity. Check missing tables and double-counted private dining seats.",
    );
  return {
    created: true,
    core_ready: coreReady,
    geo_verified: verified,
    unknown,
    unverified,
    disputed,
    expired: expired + recordExpired,
    warnings,
    english_review_fields: englishReview,
    scenes_to_review: p.records.scene.filter((s) => s.needs_review).length,
  };
}
