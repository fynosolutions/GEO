"use client";
import { useState, useEffect, createContext, useContext } from "react";
import { Button } from "../../shared/ui/button";
import {
  FACT_FIELDS,
  GROUPS,
  VIRTUAL_FACT_LABELS,
  RECORD_NAMES,
  LABELS,
  WEEKDAYS,
  US_TIMEZONES,
  recordDefinition,
  type FieldDefinition,
  type Fact,
  type Profile,
  type GroupKey,
  type RecordType,
  type Value,
  type DayHours,
  type MerchantRecord,
} from "../../modules/merchant/public";
export async function call<T>(
  op: string,
  args: unknown = {},
  write = false,
): Promise<T> {
  const response = await fetch(
    write
      ? "/api/merchant"
      : "/api/merchant?" +
          new URLSearchParams({ op, args: JSON.stringify(args) }),
    write
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ op, args }),
        }
      : { cache: "no-store" },
  );
  const result = await response.json();
  if (!response.ok || !result.ok)
    throw new Error(
      result.error?.message || "Request failed. Please try again.",
    );
  return result.data as T;
}
export const label = (v: string) => LABELS[v] || v;
export const display = (v: unknown): string =>
  v === null || v === undefined
    ? "Unknown"
    : typeof v === "boolean"
      ? v
        ? "Yes"
        : "No"
      : Array.isArray(v)
        ? v
            .map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x)))
            .join(", ")
        : String(v);
export const recordTitle = (r: MerchantRecord) =>
  String(
    r.values.name ||
      r.values.subject ||
      r.values.value ||
      r.values.start_date ||
      r.values.object_id ||
      r.record_id.slice(0, 8),
  );
const ModalCloseContext = createContext<() => void>(() => {});
export function ModalCancel() {
  const close = useContext(ModalCloseContext);
  return (
    <Button variant="outline" onClick={close}>
      Cancel
    </Button>
  );
}
export function Modal({
  title,
  children,
  onClose,
  large = false,
  dirty = false,
  onSave,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  large?: boolean;
  dirty?: boolean;
  onSave?: () => Promise<boolean>;
}) {
  const [confirmClose, setConfirmClose] = useState(false);
  const requestClose = () => {
    if (dirty) setConfirmClose(true);
    else onClose();
  };
  const [modalError, setModalError] = useState<string | null>(null);
  useEffect(() => {
    const listener = (e: Event) =>
      setModalError((e as CustomEvent<string>).detail);
    window.addEventListener("geobase-error", listener);
    return () => window.removeEventListener("geobase-error", listener);
  }, []);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [onClose, dirty]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  return (
    <div className="modal-bg">
      <ModalCloseContext.Provider value={requestClose}>
        <section
          className={"modal " + (large ? "large" : "")}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <button className="close" aria-label="Close" onClick={requestClose}>
            ×
          </button>
          <h2>{title}</h2>
          {confirmClose && (
            <div className="alert" role="alert">
              <span>You have unsaved changes.</span>
              {onSave && (
                <Button
                  size="sm"
                  onClick={async () => {
                    if (await onSave()) onClose();
                  }}
                >
                  Save and close
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={onClose}>
                Discard changes
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmClose(false)}
              >
                Keep editing
              </Button>
            </div>
          )}
          {modalError && (
            <div className="alert error" role="alert">
              <span>{modalError}</span>
              <button
                className="link-button"
                onClick={() => setModalError(null)}
                aria-label="Dismiss error"
              >
                ×
              </button>
            </div>
          )}
          {children}
        </section>
      </ModalCloseContext.Provider>
    </div>
  );
}
function Tags({
  value,
  onChange,
}: {
  value: Value | undefined;
  onChange: (v: Value) => void;
}) {
  return (
    <input
      defaultValue={Array.isArray(value) ? value.join(", ") : ""}
      placeholder="Separate items with commas"
      onChange={(e) =>
        onChange(
          e.target.value
            .split(/[,，\n]/)
            .map((x) => x.trim())
            .filter(Boolean),
        )
      }
    />
  );
}
export function ValueInput({
  def,
  value,
  onChange,
  profile,
  values = {},
}: {
  def: FieldDefinition;
  value: Value | undefined;
  onChange: (v: Value) => void;
  profile?: Profile;
  values?: Record<string, Value>;
}) {
  if (def.key === "timezone")
    return (
      <select
        aria-label={def.label}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">Select the restaurant's time zone</option>
        {value &&
          !US_TIMEZONES.includes(value as (typeof US_TIMEZONES)[number]) && (
            <option value={String(value)}>{String(value)} (legacy)</option>
          )}
        {US_TIMEZONES.map((zone) => (
          <option key={zone} value={zone}>
            {zone.replaceAll("_", " ")}
          </option>
        ))}
      </select>
    );
  const ref = def.ref?.startsWith("$")
    ? String(values[def.ref.slice(1)] || "")
    : def.ref;
  if (["basis_keys", "absent_fields"].includes(def.key) && profile)
    return (
      <select
        multiple
        aria-label={def.label}
        value={Array.isArray(value) ? (value as string[]) : []}
        onChange={(e) =>
          onChange(Array.from(e.target.selectedOptions).map((o) => o.value))
        }
      >
        {Object.entries(FACT_FIELDS).flatMap(([group, fields]) =>
          fields.map((f) => (
            <option key={group + "." + f.key} value={group + "." + f.key}>
              {GROUPS[group as GroupKey]} / {f.label}
            </option>
          )),
        )}
        {Object.entries(VIRTUAL_FACT_LABELS).map(([key, name]) => (
          <option key={key} value={key}>
            {name}
          </option>
        ))}
      </select>
    );
  if (ref && profile && RECORD_NAMES.includes(ref as RecordType)) {
    const records = profile.records[ref as RecordType];
    if (def.kind === "tags")
      return (
        <select
          multiple
          aria-label={def.label}
          value={Array.isArray(value) ? (value as string[]) : []}
          onChange={(e) =>
            onChange(Array.from(e.target.selectedOptions).map((o) => o.value))
          }
        >
          {records.map((r) => (
            <option key={r.record_id} value={r.record_id}>
              {recordTitle(r)}
            </option>
          ))}
        </select>
      );
    return (
      <select
        aria-label={def.label}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">Select a related record</option>
        {records.map((r) => (
          <option key={r.record_id} value={r.record_id}>
            {recordTitle(r)}
          </option>
        ))}
      </select>
    );
  }
  if (def.kind === "hours")
    return (
      <HoursEditor value={value as DayHours[] | null} onChange={onChange} />
    );
  if (def.kind === "tags") return <Tags value={value} onChange={onChange} />;
  if (def.kind === "boolean")
    return (
      <select
        aria-label={def.label}
        value={value === true ? "yes" : value === false ? "no" : ""}
        onChange={(e) =>
          onChange(
            e.target.value === "yes"
              ? true
              : e.target.value === "no"
                ? false
                : null,
          )
        }
      >
        <option value="">Select an option</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    );
  if (def.options)
    return (
      <select
        aria-label={def.label}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">Select an option</option>
        {def.options.map((o) => (
          <option key={o} value={o}>
            {def.key === "cooperation_status" && o === "pending"
              ? "Pending"
              : label(o)}
          </option>
        ))}
      </select>
    );
  if (def.kind === "textarea")
    return (
      <textarea
        aria-label={def.label}
        placeholder={def.hint}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  return (
    <input
      aria-label={def.label}
      type={
        def.kind === "date"
          ? "date"
          : def.kind === "number" || def.kind === "integer"
            ? "number"
            : "text"
      }
      step={def.kind === "number" ? "any" : undefined}
      value={String(value ?? "")}
      placeholder={
        def.kind === "datetime" ? "2026-10-19T09:00:00-04:00" : def.hint
      }
      onChange={(e) =>
        onChange(
          e.target.value === ""
            ? null
            : def.kind === "integer"
              ? Number(e.target.value)
              : e.target.value,
        )
      }
    />
  );
}
function HoursEditor({
  value,
  onChange,
}: {
  value: DayHours[] | null;
  onChange: (v: Value) => void;
}) {
  const days =
    value ||
    Array.from({ length: 7 }, (_, i) => ({
      day: i + 1,
      mode: "unknown" as const,
      periods: [],
    }));
  const set = (index: number, patch: Partial<DayHours>) =>
    onChange(days.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  return (
    <div>
      {days.map((day, index) => (
        <div className="hours-row" key={day.day}>
          <span>{WEEKDAYS[day.day - 1]}</span>
          <select
            aria-label={`${WEEKDAYS[day.day - 1]} hours mode`}
            value={day.mode}
            onChange={(e) =>
              set(index, {
                mode: e.target.value as DayHours["mode"],
                periods: e.target.value === "periods" ? day.periods : [],
              })
            }
          >
            {["unknown", "closed", "all_day", "periods"].map((o) => (
              <option key={o} value={o}>
                {label(o)}
              </option>
            ))}
          </select>
          <div>
            {day.mode === "periods" && (
              <>
                {day.periods.map((period, pi) => (
                  <div key={pi} className="period-row">
                    <input
                      aria-label="Opening time"
                      type="time"
                      value={period.start}
                      onChange={(e) =>
                        set(index, {
                          periods: day.periods.map((p, i) =>
                            i === pi ? { ...p, start: e.target.value } : p,
                          ),
                        })
                      }
                    />
                    <span>—</span>
                    <input
                      aria-label="Closing time"
                      type="time"
                      value={period.end}
                      onChange={(e) =>
                        set(index, {
                          periods: day.periods.map((p, i) =>
                            i === pi ? { ...p, end: e.target.value } : p,
                          ),
                        })
                      }
                    />
                    <select
                      aria-label="End date"
                      value={period.end_day_offset}
                      onChange={(e) =>
                        set(index, {
                          periods: day.periods.map((p, i) =>
                            i === pi
                              ? {
                                  ...p,
                                  end_day_offset: Number(e.target.value) as
                                    0 | 1,
                                }
                              : p,
                          ),
                        })
                      }
                    >
                      <option value={0}>Same day</option>
                      <option value={1}>Next day</option>
                    </select>
                    <input
                      type="time"
                      aria-label="Last order"
                      title="Last order (optional)"
                      value={period.last_order || ""}
                      onChange={(e) =>
                        set(index, {
                          periods: day.periods.map((p, i) =>
                            i === pi
                              ? {
                                  ...p,
                                  last_order: e.target.value || undefined,
                                }
                              : p,
                          ),
                        })
                      }
                    />
                    <select
                      aria-label="Last-order day"
                      value={period.last_order_day_offset || 0}
                      onChange={(e) =>
                        set(index, {
                          periods: day.periods.map((p, i) =>
                            i === pi
                              ? {
                                  ...p,
                                  last_order_day_offset: Number(
                                    e.target.value,
                                  ) as 0 | 1,
                                }
                              : p,
                          ),
                        })
                      }
                    >
                      <option value={0}>Same day</option>
                      <option value={1}>Next day</option>
                    </select>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        set(index, {
                          periods: day.periods.filter((_, i) => i !== pi),
                        })
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    set(index, {
                      periods: [
                        ...day.periods,
                        { start: "", end: "", end_day_offset: 0 },
                      ],
                    })
                  }
                >
                  Add period
                </Button>
              </>
            )}
            {index === 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  onChange(
                    days.map((d) => ({ ...structuredClone(day), day: d.day })),
                  )
                }
              >
                Copy to other days
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
function MetadataEditor({
  fact,
  onChange,
  profile,
}: {
  fact: Fact;
  onChange: (patch: Partial<Fact>) => void;
  profile: Profile;
}) {
  return (
    <div className="grid2">
      <label>
        <span>Visibility</span>
        <select
          value={fact.publication_state}
          onChange={(e) =>
            onChange({
              publication_state: e.target.value as Fact["publication_state"],
            })
          }
        >
          {["pending", "public", "internal"].map((v) => (
            <option key={v} value={v}>
              {label(v)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Source type</span>
        <select
          value={fact.source_type}
          onChange={(e) => onChange({ source_type: e.target.value })}
        >
          {[
            "manual_input",
            "merchant_provided",
            "phone",
            "onsite",
            "public_page",
            "other",
          ].map((v, i) => (
            <option key={v} value={v}>
              {
                [
                  "Manual entry",
                  "Restaurant provided",
                  "Phone confirmation",
                  "On-site confirmation",
                  "Public page",
                  "Other",
                ][i]
              }
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Source notes</span>
        <input
          value={fact.source_note}
          onChange={(e) => onChange({ source_note: e.target.value })}
        />
      </label>
      <label>
        <span>Collected at (with UTC offset)</span>
        <input
          placeholder="2026-10-19T09:00:00+08:00"
          value={fact.collected_at || ""}
          onChange={(e) => onChange({ collected_at: e.target.value || null })}
        />
      </label>
      <label>
        <span>Valid from</span>
        <input
          type="date"
          value={fact.valid_from || ""}
          onChange={(e) => onChange({ valid_from: e.target.value || null })}
        />
      </label>
      <label>
        <span>Valid through</span>
        <input
          type="date"
          value={fact.valid_to || ""}
          onChange={(e) => onChange({ valid_to: e.target.value || null })}
        />
      </label>
      <label>
        <span>Evidence (select multiple)</span>
        <select
          multiple
          value={fact.evidence_ids}
          onChange={(e) =>
            onChange({
              evidence_ids: Array.from(e.target.selectedOptions).map(
                (x) => x.value,
              ),
            })
          }
        >
          {profile.records.evidence.map((r) => (
            <option key={r.record_id} value={r.record_id}>
              {recordTitle(r)}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Internal notes</span>
        <input
          value={fact.note}
          onChange={(e) => onChange({ note: e.target.value })}
        />
      </label>
    </div>
  );
}
export interface FormControl {
  dirty: (v: boolean) => void;
  register: (save: (() => Promise<boolean>) | null) => void;
  error: (message: string) => void;
  done: () => Promise<void>;
}
export function GroupForm({
  profile,
  group,
  control,
  readOnly,
  onVerify,
  onPublish,
}: {
  profile: Profile;
  group: GroupKey;
  control: FormControl;
  readOnly: boolean;
  onVerify: (keys: string[]) => void;
  onPublish: (keys: string[]) => void;
}) {
  const [fields, setFields] = useState(() =>
      structuredClone(profile.groups[group]),
    ),
    [selected, setSelected] = useState<string[]>([]),
    [saving, setSaving] = useState(false),
    [changed, setChanged] = useState(false),
    [brandId, setBrandId] = useState(profile.brand_id || "");
  const [brands, setBrands] = useState<{ brand_id: string; name: string }[]>(
    [],
  );
  useEffect(() => {
    if (group === "identity")
      void call<typeof brands>("listBrands")
        .then(setBrands)
        .catch((e) => control.error(e.message));
  }, [group]);
  const patch = (key: string, value: Partial<Fact>) => {
    setFields((fs) => ({ ...fs, [key]: { ...fs[key], ...value } }));
    setChanged(true);
    control.dirty(true);
  };
  async function save() {
    setSaving(true);
    try {
      await call(
        "saveGroup",
        {
          merchant_id: profile.merchant_id,
          expected_profile_version: profile.profile_version,
          group_key: group,
          fields,
          ...(group === "identity" ? { brand_id: brandId || null } : {}),
        },
        true,
      );
      setChanged(false);
      control.dirty(false);
      await control.done();
      return true;
    } catch (e) {
      control.error((e as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  }
  useEffect(() => {
    control.register(save);
    return () => control.register(null);
  });
  return (
    <div className="panel">
      <div className="section-head">
        <h2>Basic details</h2>
        <span className="muted">
          {changed ? "Unsaved changes" : "Save by section"}
        </span>
      </div>
      <fieldset
        disabled={readOnly || saving}
        style={{ border: 0, padding: 0, margin: 0 }}
      >
        <div className="grid2">
          {group === "identity" && (
            <label className="field wide">
              <span>Brand association</span>
              <select
                value={brandId}
                onChange={(e) => {
                  setBrandId(e.target.value);
                  setChanged(true);
                  control.dirty(true);
                }}
              >
                <option value="">Independent restaurant</option>
                {brands.map((b) => (
                  <option key={b.brand_id} value={b.brand_id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {FACT_FIELDS[group]
            .filter(
              (def) =>
                !def.legacy ||
                profile.groups[group][def.key].value_state !== "unknown",
            )
            .map((def) => {
              const fact = fields[def.key];
              if (!fact) return null;
              return (
                <div
                  className={
                    "field " +
                    (["textarea", "hours"].includes(def.kind) ? "wide" : "")
                  }
                  key={def.key}
                >
                  <div className="field-head">
                    <label className="wide-label">
                      <input
                        type="checkbox"
                        aria-label={`Select ${def.label}`}
                        checked={selected.includes(def.key)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, def.key]
                              : selected.filter((k) => k !== def.key),
                          )
                        }
                      />
                      {def.label}
                      {def.required ? " *" : ""}
                    </label>
                    <select
                      aria-label={`${def.label} value status`}
                      value={fact.value_state}
                      onChange={(e) =>
                        patch(def.key, {
                          value_state: e.target.value as Fact["value_state"],
                          value: e.target.value === "known" ? fact.value : null,
                        })
                      }
                    >
                      {["unknown", "known", "not_applicable"].map((v) => (
                        <option key={v} value={v}>
                          {label(v)}
                        </option>
                      ))}
                    </select>
                  </div>
                  {fact.value_state === "known" ? (
                    <ValueInput
                      def={def}
                      value={
                        fact.options && Array.isArray(fact.value)
                          ? (fact.value as string[]).map(
                              (v) =>
                                fact.options?.find((o) => o.id === v)?.label ||
                                v,
                            )
                          : fact.value
                      }
                      onChange={(value) => patch(def.key, { value })}
                      profile={profile}
                    />
                  ) : fact.value_state === "not_applicable" ? (
                    <input
                      aria-label={`${def.label} reason not applicable`}
                      placeholder="Enter a reason this does not apply."
                      value={fact.not_applicable_reason}
                      onChange={(e) =>
                        patch(def.key, {
                          not_applicable_reason: e.target.value,
                        })
                      }
                    />
                  ) : (
                    <div className="muted" style={{ padding: "8px 0" }}>
                      Not yet researched
                    </div>
                  )}
                  <small>
                    {label(fact.verification_state)} ·{" "}
                    {label(fact.publication_state)}
                    {def.unit ? " · " + def.unit : ""}
                  </small>
                  <details>
                    <summary>Source, evidence &amp; validity</summary>
                    <MetadataEditor
                      fact={fact}
                      profile={profile}
                      onChange={(p) => patch(def.key, p)}
                    />
                  </details>
                </div>
              );
            })}
        </div>
      </fieldset>
      {!readOnly && (
        <div className="form-actions">
          <Button
            variant="outline"
            disabled={!selected.length || changed}
            onClick={() => onPublish(selected.map((k) => group + "." + k))}
          >
            Set visibility
          </Button>
          <Button
            variant="outline"
            disabled={!selected.length || changed}
            onClick={() => onVerify(selected.map((k) => group + "." + k))}
          >
            Verify selected ({selected.length})
          </Button>
          <Button disabled={saving || !changed} onClick={save}>
            {saving ? "Saving…" : "Save section"}
          </Button>
        </div>
      )}
      {changed && selected.length > 0 && (
        <small>Save this section before verifying facts.</small>
      )}
    </div>
  );
}
export function RecordForm({
  profile,
  type,
  record,
  onDone,
  onCancel,
  onDirty,
  onSaveRegister,
  onError,
}: {
  profile: Profile;
  type: RecordType;
  record?: MerchantRecord;
  onDone: (continueAdding?: boolean) => Promise<void>;
  onCancel: () => void;
  onDirty: (v: boolean) => void;
  onSaveRegister: (save: (() => Promise<boolean>) | null) => void;
  onError: (s: string) => void;
}) {
  const def = recordDefinition(type);
  const [values, setValues] = useState<Record<string, Value>>(() =>
    structuredClone(record?.values || {}),
  );
  const [metadata, setMetadata] = useState<Fact>(
    () =>
      record?.metadata || {
        field_key: "",
        value_state: "known",
        value: true,
        verification_state: "unverified",
        publication_state:
          def.group === "relationship" ? "internal" : "pending",
        source_type: "manual_input",
        source_note: "",
        collected_at: null,
        verified_at: null,
        valid_from: null,
        valid_to: null,
        evidence_ids: [],
        note: "",
        not_applicable_reason: "",
      },
  );
  const [busy, setBusy] = useState(false);
  async function save(continueAdding = false) {
    setBusy(true);
    try {
      const cleaned = Object.fromEntries(
        Object.entries(values).filter(([, v]) => v !== null && v !== ""),
      );
      await call(
        "saveRecord",
        {
          merchant_id: profile.merchant_id,
          expected_profile_version: profile.profile_version,
          record_type: type,
          record_id: record?.record_id,
          values: cleaned,
          metadata,
        },
        true,
      );
      onDirty(false);
      await onDone(continueAdding);
      return true;
    } catch (e) {
      onError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    onSaveRegister(save);
    return () => onSaveRegister(null);
  });
  return (
    <>
      <div className="grid2">
        {def.fields.map((f) => (
          <label
            className={"field " + (f.kind === "textarea" ? "wide" : "")}
            key={f.key}
          >
            <span>
              {f.label}
              {f.required ? " *" : ""}
            </span>
            <ValueInput
              def={f}
              value={values[f.key]}
              values={values}
              profile={profile}
              onChange={(value) => {
                setValues((v) => ({ ...v, [f.key]: value }));
                onDirty(true);
              }}
            />
            {f.hint && <small>{f.hint}</small>}
          </label>
        ))}
      </div>
      <details style={{ marginTop: 20 }}>
        <summary>Visibility, source &amp; evidence</summary>
        <MetadataEditor
          fact={metadata}
          profile={profile}
          onChange={(patch) => {
            setMetadata((m) => ({ ...m, ...patch }));
            onDirty(true);
          }}
        />
      </details>
      {def.group === "relationship" && (
        <p className="inline-note">These records are always internal only.</p>
      )}
      <div className="form-actions">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        {!record?.record_id && (
          <Button variant="outline" disabled={busy} onClick={() => save(true)}>
            Save and add another
          </Button>
        )}
        <Button disabled={busy} onClick={() => save()}>
          {busy ? "Saving…" : "Save record"}
        </Button>
      </div>
    </>
  );
}
export function VerifyForm({
  profile,
  targets,
  onDone,
  onError,
}: {
  profile: Profile;
  targets: string[];
  onDone: () => Promise<void>;
  onError: (v: string) => void;
}) {
  const [source, setSource] = useState(""),
    [time, setTime] = useState(new Date().toISOString()),
    [state, setState] = useState("verified"),
    [note, setNote] = useState(""),
    [evidence, setEvidence] = useState<string[]>([]),
    [busy, setBusy] = useState(false);
  return (
    <>
      <p className="muted">
        Update only the following {targets.length} items. Saving a record does
        not verify it.
      </p>
      <ul>
        {targets.map((key) => {
          const record = key.includes(":")
            ? profile.records[key.split(":")[0] as RecordType].find(
                (r) => r.record_id === key.split(":")[1],
              )
            : undefined;
          const [g, k] = key.split(".");
          const fact = !record ? profile.groups[g as GroupKey]?.[k] : undefined;
          return (
            <li key={key}>
              {record
                ? recordDefinition(record.record_type).label +
                  ": " +
                  recordTitle(record)
                : (FACT_FIELDS[g as GroupKey]?.find((f) => f.key === k)
                    ?.label || key) +
                  ": " +
                  display(fact?.value)}
            </li>
          );
        })}
      </ul>
      <div className="grid2">
        <label>
          <span>Verification status</span>
          <select value={state} onChange={(e) => setState(e.target.value)}>
            {["verified", "unverified", "disputed"].map((v) => (
              <option key={v} value={v}>
                {label(v)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Verified at (with UTC offset)</span>
          <input value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <label className="field wide">
          <span>Source &amp; verification notes *</span>
          <textarea
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
        </label>
        <label className="field wide">
          <span>Dispute reason / internal notes</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <label className="field wide">
          <span>Evidence (optional; text notes are accepted)</span>
          <select
            multiple
            value={evidence}
            onChange={(e) =>
              setEvidence(
                Array.from(e.target.selectedOptions).map((o) => o.value),
              )
            }
          >
            {profile.records.evidence.map((r) => (
              <option key={r.record_id} value={r.record_id}>
                {recordTitle(r)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="form-actions">
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await call(
                "verifyFacts",
                {
                  merchant_id: profile.merchant_id,
                  expected_profile_version: profile.profile_version,
                  targets,
                  state,
                  source_note: source,
                  verified_at: state === "verified" ? time : null,
                  note,
                  evidence_ids: evidence,
                },
                true,
              );
              await onDone();
            } catch (e) {
              onError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Confirm verification update
        </Button>
      </div>
    </>
  );
}
