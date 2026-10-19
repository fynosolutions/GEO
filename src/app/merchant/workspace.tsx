"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  BookOpen,
  ArrowLeft,
  Plus,
  Search,
  Archive,
  Database,
  Building2,
  Activity,
  SlidersHorizontal,
  FileText,
  RefreshCw,
  Check,
} from "lucide-react";
import { Button } from "../../shared/ui/button";
import {
  GROUPS,
  US_TIMEZONES,
  US_STATES,
  RECORD_NAMES,
  FACT_FIELDS,
  recordDefinition,
  type Profile,
  type GroupKey,
  type RecordType,
  type Brand,
  type Change,
  type MerchantRecord,
} from "../../modules/merchant/public";
import {
  call,
  label,
  display,
  recordTitle,
  Modal,
  ModalCancel,
  GroupForm,
  RecordForm,
  VerifyForm,
  type FormControl,
} from "./editors";
type Ready = {
  warnings?: string[];
  created: boolean;
  core_ready: boolean;
  geo_verified: boolean;
  unknown: number;
  unverified: number;
  disputed: number;
  expired: number;
  scenes_to_review: number;
};
type Loaded = Profile & {
  as_of_date: string;
  timezone: string;
  readiness?: Ready;
};
type Summary = {
  merchant_id: string;
  profile_version: number;
  name: string;
  branch_name: string | null;
  address: string;
  region: string;
  brand: string | null;
  status: string;
  archived: boolean;
  updated_at: string;
  readiness: Ready;
};
type Backup = { name: string; size: number; created_at: string };
type Prepared = {
  token: string;
  source: string;
  created_at: string;
  merchants: number;
  versions: number;
  assets: number;
  asset_bytes: number;
};
const size = (v: number) =>
  v > 1024 ** 3
    ? (v / 1024 ** 3).toFixed(2) + " GB"
    : v > 1024 ** 2
      ? (v / 1024 ** 2).toFixed(1) + " MB"
      : (v / 1024).toFixed(1) + " KB";
const time = (v: string) =>
  new Date(v).toLocaleString("en-US", { timeZoneName: "short" });
export default function Workspace() {
  const [section, setSection] = useState("merchants"),
    [profile, setProfile] = useState<Loaded | null>(null),
    [group, setGroup] = useState<GroupKey | "scene_tags" | "history">(
      "identity",
    ),
    [historical, setHistorical] = useState(false),
    [history, setHistory] = useState<Change[]>([]);
  const [publicationTargets, setPublicationTargets] = useState<string[] | null>(
      null,
    ),
    [publicationState, setPublicationState] = useState("pending");
  const [rows, setRows] = useState<Summary[]>([]),
    [total, setTotal] = useState(0),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [archived, setArchived] = useState(false),
    [sort, setSort] = useState("updated"),
    [filterStatus, setFilterStatus] = useState(""),
    [filterRegion, setFilterRegion] = useState(""),
    [filterCuisine, setFilterCuisine] = useState(""),
    [filterReady, setFilterReady] = useState(""),
    [filterCoop, setFilterCoop] = useState(""),
    [filterBrand, setFilterBrand] = useState(""),
    [showFilters, setShowFilters] = useState(false);
  const [brands, setBrands] = useState<Brand[]>([]),
    [brandModal, setBrandModal] = useState<Brand | null | false>(false),
    [newModal, setNewModal] = useState(false),
    [recordModal, setRecordModal] = useState<{
      type: RecordType;
      record?: MerchantRecord;
    } | null>(null),
    [verify, setVerify] = useState<string[] | null>(null),
    [exportModal, setExportModal] = useState(false),
    [exportAssets, setExportAssets] = useState<string[]>([]);
  const [message, setMessage] = useState<{
      text: string;
      error: boolean;
    } | null>(null),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [revision, setRevision] = useState(0),
    [pending, setPending] = useState<(() => void) | null>(null),
    [refreshTick, setRefreshTick] = useState(0);
  const saveRef = useRef<(() => Promise<boolean>) | null>(null),
    recordSave = useRef<(() => Promise<boolean>) | null>(null),
    [recordDirty, setRecordDirty] = useState(false),
    [closeRecordPrompt, setCloseRecordPrompt] = useState(false);
  const [backups, setBackups] = useState<Backup[]>([]),
    [backupError, setBackupError] = useState<string | null>(null),
    [prepared, setPrepared] = useState<Prepared | null>(null);
  const [backupReady, setBackupReady] = useState(false);
  const error = useCallback((text: string) => {
    setMessage({ text, error: true });
    window.dispatchEvent(new CustomEvent("geobase-error", { detail: text }));
  }, []);
  const success = (text: string) => setMessage({ text, error: false });
  useEffect(() => {
    const listener = (e: BeforeUnloadEvent) => {
      if (dirty || recordDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", listener);
    return () => window.removeEventListener("beforeunload", listener);
  }, [dirty, recordDirty]);
  function navigate(action: () => void) {
    if (dirty) setPending(() => action);
    else action();
  }
  const refreshBackup = useCallback(async () => {
    try {
      const response = await fetch("/api/backup", { cache: "no-store" }),
        r = await response.json();
      if (!r.ok)
        throw new Error(r.error?.message || "Could not load backup status.");
      setBackups(r.data.backups);
      setBackupError(r.data.backup_error);
      setBackupReady(!r.data.backup_error);
    } catch (e) {
      error((e as Error).message);
    }
  }, [error]);
  useEffect(() => {
    void refreshBackup();
  }, [refreshBackup]);
  useEffect(() => {
    if (section !== "merchants" || profile) return;
    let active = true;
    const timeout = setTimeout(() => {
      setLoading(true);
      call<{ items: Summary[]; total: number }>("listMerchants", {
        query,
        page,
        page_size: 20,
        sort,
        filters: {
          archived,
          status: filterStatus || undefined,
          region: filterRegion || undefined,
          cuisine: filterCuisine || undefined,
          readiness: filterReady || undefined,
          cooperation_status: filterCoop || undefined,
          brand_id: filterBrand || undefined,
        },
      })
        .then((r) => {
          if (active) {
            setRows(r.items);
            setTotal(r.total);
          }
        })
        .catch((e) => {
          if (active) error(e.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [
    section,
    profile,
    query,
    page,
    archived,
    sort,
    filterStatus,
    filterRegion,
    filterCuisine,
    filterReady,
    filterCoop,
    filterBrand,
    refreshTick,
    error,
  ]);
  useEffect(() => {
    void call<Brand[]>("listBrands")
      .then(setBrands)
      .catch((e) => error(e.message));
  }, [section, refreshTick, error]);
  async function openMerchant(id: string, version?: number) {
    setLoading(true);
    try {
      const p = await call<Loaded>("getMerchantProfile", {
        merchant_id: id,
        profile_version: version,
        projection: "workspace",
      });
      setProfile(p);
      setHistorical(version !== undefined);
      setGroup("identity");
      setDirty(false);
      setRevision((r) => r + 1);
      setMessage(null);
    } catch (e) {
      error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function reload() {
    if (!profile) return;
    const p = await call<Loaded>("getMerchantProfile", {
      merchant_id: profile.merchant_id,
      projection: "workspace",
    });
    setProfile(p);
    setHistorical(false);
    setDirty(false);
    setRevision((r) => r + 1);
    setRefreshTick((t) => t + 1);
  }
  async function action(fn: () => Promise<unknown>, text = "Saved") {
    setBusy(true);
    try {
      await fn();
      await reload();
      success(text);
    } catch (e) {
      error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const versionArgs = profile
    ? {
        merchant_id: profile.merchant_id,
        expected_profile_version: profile.profile_version,
      }
    : null;
  const control: FormControl = {
    dirty: setDirty,
    register: (fn) => {
      saveRef.current = fn;
    },
    error,
    done: async () => {
      await reload();
      success("Section saved.");
    },
  };
  const readOnly = historical || !!profile?.archived || !backupReady;
  const switchSection = (name: string) =>
    navigate(() => {
      setSection(name);
      setProfile(null);
      setDirty(false);
      setMessage(null);
      setRefreshTick((t) => t + 1);
    });
  const changeGroup = (g: typeof group) =>
    navigate(() => {
      setDirty(false);
      setRevision((r) => r + 1);
      setGroup(g);
      if (g === "history" && profile)
        void call<{ changes: Change[] }>("getMerchantHistory", {
          merchant_id: profile.merchant_id,
        })
          .then((r) => setHistory(r.changes))
          .catch((e) => error(e.message));
    });
  const closeRecord = () => {
    if (recordDirty) setCloseRecordPrompt(true);
    else setRecordModal(null);
  };
  async function backupAction(
    actionName: string,
    extra: Record<string, unknown> = {},
  ) {
    setBusy(true);
    try {
      const r = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: actionName, ...extra }),
      }).then((r) => r.json());
      if (!r.ok) throw new Error(r.error?.message || "Operation failed.");
      if (actionName === "prepare") setPrepared(r.data);
      else if (actionName === "discard") setPrepared(null);
      else if (actionName === "restore") {
        setPrepared(null);
        setProfile(null);
        setRefreshTick((t) => t + 1);
        success(
          "Restore complete. Previous data is retained in a separate backup.",
        );
      } else
        success(
          actionName === "skip"
            ? "Editing enabled for this session. Create a backup soon."
            : "Backup complete.",
        );
      await refreshBackup();
      return r.data;
    } catch (e) {
      error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">G</span>GeoBase
        </div>
        <div>
          <p className="eyebrow">Restaurant GEO workstation</p>
          <nav className="nav" aria-label="Workstation navigation">
            <button
              className={section === "merchants" ? "active" : ""}
              onClick={() => switchSection("merchants")}
            >
              <BookOpen size={17} />
              Restaurant library
            </button>
            <button disabled>
              <Activity size={17} />
              Prompt monitoring
            </button>
            <button disabled>
              <SlidersHorizontal size={17} />
              Consistency audit
            </button>
            <button disabled>
              <FileText size={17} />
              Comparison reports
            </button>
          </nav>
        </div>
        <nav className="nav">
          <button
            className={section === "brands" ? "active" : ""}
            onClick={() => switchSection("brands")}
          >
            <Building2 size={17} />
            Brands
          </button>
          <button
            className={section === "backup" ? "active" : ""}
            onClick={() => switchSection("backup")}
          >
            <Database size={17} />
            Backup &amp; restore
          </button>
        </nav>
        <div className="sidebar-foot">
          <span className="badge">
            <span style={{ fontSize: 9 }}>●</span> Local workstation
          </span>
          <p style={{ margin: "12px 0 0" }}>
            Build complete profiles. Keep facts verified.
          </p>
        </div>
      </aside>
      <main className="main" aria-busy={loading || busy}>
        {!backupReady && !backupError && (
          <div className="alert" role="status">
            <span>
              Checking the daily backup. Editing will be available shortly.
            </span>
          </div>
        )}
        {backupError && (
          <div className="alert error" role="alert">
            <span>Daily backup failed:{backupError}</span>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => backupAction("retry_auto")}
            >
              Retry backup
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => backupAction("skip")}
            >
              Continue this session
            </Button>
          </div>
        )}
        {message && (
          <div
            className={"alert " + (message.error ? "error" : "success")}
            role={message.error ? "alert" : "status"}
          >
            <span>{message.text}</span>
            {message.error && profile && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  navigate(() => void openMerchant(profile.merchant_id))
                }
              >
                Reload profile
              </Button>
            )}
            <button
              aria-label="Dismiss message"
              className="link-button"
              onClick={() => setMessage(null)}
            >
              ×
            </button>
          </div>
        )}
        {section === "merchants" && !profile && (
          <>
            <header className="topline">
              <div>
                <h1>
                  {archived ? "Archived restaurants" : "Restaurant library"}
                </h1>
                <p>Manage restaurant facts, media and verification</p>
              </div>
              <Button
                disabled={!backupReady || busy}
                onClick={() => setNewModal(true)}
              >
                <Plus size={16} />
                Add restaurant
              </Button>
            </header>
            <div className="stats">
              <div className="stat">
                <span className="muted">Matching restaurants</span>
                <strong>{total}</strong>
              </div>
              <div className="stat">
                <span className="muted">Core profiles ready on this page</span>
                <strong>
                  {rows.filter((r) => r.readiness.core_ready).length}
                  <small> / {rows.length}</small>
                </strong>
              </div>
              <div className="stat">
                <span className="muted">GEO facts verified on this page</span>
                <strong>
                  {rows.filter((r) => r.readiness.geo_verified).length}
                  <small> / {rows.length}</small>
                </strong>
              </div>
            </div>
            <div className="panel">
              <div className="toolbar" style={{ marginBottom: 20 }}>
                <Search size={18} className="muted" />
                <input
                  aria-label="Search restaurants"
                  placeholder="Search name, brand, address or public phone"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(1);
                  }}
                />
                <select
                  aria-label="Filter by operating status"
                  value={filterStatus}
                  onChange={(e) => {
                    setFilterStatus(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">All operating statuses</option>
                  {[
                    "unknown",
                    "preparing",
                    "open",
                    "temporarily_closed",
                    "permanently_closed",
                  ].map((v) => (
                    <option key={v} value={v}>
                      {label(v)}
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  onClick={() => setShowFilters(!showFilters)}
                >
                  <SlidersHorizontal size={14} />
                  Filters
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setArchived(!archived);
                    setPage(1);
                  }}
                >
                  <Archive size={14} />
                  {archived ? "Active restaurants" : "Archive"}
                </Button>
              </div>
              {showFilters && (
                <div className="toolbar" style={{ marginBottom: 20 }}>
                  <input
                    placeholder="City or market"
                    aria-label="Filter by market"
                    value={filterRegion}
                    onChange={(e) => {
                      setFilterRegion(e.target.value);
                      setPage(1);
                    }}
                  />
                  <input
                    placeholder="Cuisine"
                    aria-label="Filter by cuisine"
                    value={filterCuisine}
                    onChange={(e) => {
                      setFilterCuisine(e.target.value);
                      setPage(1);
                    }}
                  />
                  <select
                    aria-label="Filter by brand"
                    value={filterBrand}
                    onChange={(e) => {
                      setFilterBrand(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">All brands</option>
                    {brands.map((b) => (
                      <option key={b.brand_id} value={b.brand_id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Filter by readiness"
                    value={filterReady}
                    onChange={(e) => {
                      setFilterReady(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">All readiness levels</option>
                    <option value="core">Core profile ready</option>
                    <option value="verified">Core facts verified</option>
                    <option value="incomplete">Core profile incomplete</option>
                  </select>
                  <select
                    aria-label="Filter by engagement"
                    value={filterCoop}
                    onChange={(e) => {
                      setFilterCoop(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">All engagement statuses</option>
                    {[
                      "unknown",
                      "pending",
                      "communicating",
                      "serving",
                      "paused",
                      "ended",
                    ].map((v) => (
                      <option key={v} value={v}>
                        {v === "pending" ? "Pending" : label(v)}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Sort order"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="updated">Recently updated</option>
                    <option value="created">Recently created</option>
                    <option value="name">Name</option>
                  </select>
                </div>
              )}
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Restaurant</th>
                      <th>Operating status</th>
                      <th>Profile readiness</th>
                      <th>Recently updated</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        className="clickable"
                        key={r.merchant_id}
                        onClick={() => openMerchant(r.merchant_id)}
                      >
                        <td>
                          <span className="name">{r.name}</span>
                          <small>
                            {r.brand || "Independent restaurant"}
                            {r.branch_name ? " · " + r.branch_name : ""}
                            <br />
                            {r.address}
                          </small>
                        </td>
                        <td>
                          <span
                            className={
                              "badge " + (r.status === "open" ? "" : "gray")
                            }
                          >
                            {label(r.status)}
                          </span>
                        </td>
                        <td>
                          <span
                            className={
                              "badge " +
                              (r.readiness.geo_verified
                                ? ""
                                : r.readiness.core_ready
                                  ? "amber"
                                  : "gray")
                            }
                          >
                            {r.readiness.geo_verified
                              ? "Core facts verified"
                              : r.readiness.core_ready
                                ? "Core profile ready"
                                : "In progress"}
                          </span>
                        </td>
                        <td className="muted">{time(r.updated_at)}</td>
                        <td>
                          <button
                            className="link-button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void openMerchant(r.merchant_id);
                            }}
                          >
                            View →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!rows.length && (
                  <div className="empty">
                    <strong>
                      {loading
                        ? "Loading profiles…"
                        : query ||
                            filterStatus ||
                            filterRegion ||
                            filterCuisine ||
                            filterBrand ||
                            filterReady ||
                            filterCoop
                          ? "No matching restaurants"
                          : "Add your first restaurant"}
                    </strong>
                    <p>
                      {loading
                        ? "Please wait"
                        : "Start with the basics and complete the profile over time."}
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setQuery("");
                        setFilterStatus("");
                        setFilterRegion("");
                        setFilterCuisine("");
                        setFilterBrand("");
                        setFilterReady("");
                        setFilterCoop("");
                        setPage(1);
                      }}
                    >
                      Clear filters
                    </Button>
                  </div>
                )}
              </div>
              <div className="pagination">
                <span>
                  Total: {total} restaurants · Page {page}
                </span>
                <div className="toolbar">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 1}
                    onClick={() => setPage(page - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page * 20 >= total}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
        {section === "merchants" && profile && (
          <>
            <button
              className="back"
              onClick={() =>
                navigate(() => {
                  setProfile(null);
                  setDirty(false);
                })
              }
            >
              <ArrowLeft size={14} />
              Back to restaurants
            </button>
            <header className="profile-heading">
              <div>
                <h1>{display(profile.groups.identity.display_name.value)}</h1>
                <p>
                  {profile.groups.identity.branch_name.value
                    ? display(profile.groups.identity.branch_name.value) + " · "
                    : ""}
                  {display(profile.groups.location.address.value)}
                </p>
                <div className="chipline">
                  <span className="badge gray">
                    Profile version {profile.profile_version}
                  </span>
                  <span className="badge gray">
                    {label(
                      String(
                        profile.groups.operations.status.value || "unknown",
                      ),
                    )}
                  </span>
                  {profile.archived && (
                    <span className="badge amber">Archived</span>
                  )}
                  {historical && (
                    <span className="badge amber">History: read only</span>
                  )}
                </div>
              </div>
              <div className="toolbar">
                {historical ? (
                  <Button
                    variant="outline"
                    onClick={() => openMerchant(profile.merchant_id)}
                  >
                    Return to current profile
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => navigate(() => setExportModal(true))}
                    >
                      Export public profile
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        navigate(() => {
                          if (
                            window.confirm(
                              profile.archived
                                ? "Restore this restaurant to the active list?"
                                : "Archive this restaurant? Its profile and history will be retained.",
                            )
                          )
                            void action(
                              () =>
                                call(
                                  "archiveMerchant",
                                  {
                                    ...versionArgs,
                                    archived: !profile.archived,
                                  },
                                  true,
                                ),
                              profile.archived
                                ? "Restaurant restored."
                                : "Restaurant archived.",
                            );
                        })
                      }
                    >
                      {profile.archived ? "Restore restaurant" : "Archive"}
                    </Button>
                  </>
                )}
              </div>
            </header>
            {profile.readiness && (
              <div className="panel" style={{ padding: "15px 20px" }}>
                <div className="toolbar">
                  <span
                    className={
                      "badge " + (profile.readiness.core_ready ? "" : "gray")
                    }
                  >
                    {profile.readiness.core_ready
                      ? "✓ Core profile ready"
                      : "Core profile incomplete"}
                  </span>
                  <span
                    className={
                      "badge " + (profile.readiness.geo_verified ? "" : "gray")
                    }
                  >
                    {profile.readiness.geo_verified
                      ? "✓ GEO facts verified"
                      : "GEO verification incomplete"}
                  </span>
                  <small>
                    Unknown {profile.readiness.unknown} · Unverified{" "}
                    {profile.readiness.unverified} · Disputed{" "}
                    {profile.readiness.disputed} · Expired{" "}
                    {profile.readiness.expired} · Occasions to review{" "}
                    {profile.readiness.scenes_to_review}
                  </small>
                </div>
                <details style={{ marginTop: 8 }}>
                  <summary className="muted">
                    Review missing &amp; unverified facts
                  </summary>
                  <div className="chipline" style={{ marginTop: 10 }}>
                    {Object.entries(profile.groups).flatMap(([g, fs]) =>
                      Object.entries(fs)
                        .filter(
                          ([key, f]) =>
                            !FACT_FIELDS[g as GroupKey].find(
                              (d) => d.key === key,
                            )?.legacy &&
                            (f.value_state === "unknown" ||
                              f.verification_state !== "verified"),
                        )
                        .map(([k, f]) => (
                          <button
                            className="badge gray"
                            style={{ border: 0 }}
                            key={g + "." + k}
                            onClick={() => changeGroup(g as GroupKey)}
                          >
                            {
                              FACT_FIELDS[g as GroupKey].find(
                                (d) => d.key === k,
                              )?.label
                            }{" "}
                            ·{" "}
                            {f.value_state === "unknown"
                              ? "Unknown"
                              : label(f.verification_state)}
                          </button>
                        )),
                    )}
                  </div>
                </details>
                {profile.readiness.warnings?.map((w) => (
                  <p className="inline-note" key={w}>
                    {w}
                  </p>
                ))}
              </div>
            )}
            <div className="profile-layout">
              <nav className="group-nav" aria-label="Profile sections">
                {Object.entries(GROUPS).map(([key, name], i) => (
                  <button
                    key={key}
                    className={group === key ? "active" : ""}
                    onClick={() => changeGroup(key as GroupKey)}
                  >
                    <em>{String(i + 1).padStart(2, "0")}</em>
                    {name}
                  </button>
                ))}
                <button
                  className={group === "scene_tags" ? "active" : ""}
                  onClick={() => changeGroup("scene_tags")}
                >
                  Dining occasions &amp; supporting facts
                </button>
                <button
                  className={group === "history" ? "active" : ""}
                  onClick={() => changeGroup("history")}
                >
                  Change history
                </button>
              </nav>
              <div>
                {group !== "history" && group !== "scene_tags" && (
                  <GroupForm
                    key={`${profile.profile_version}-${group}-${revision}`}
                    profile={profile}
                    group={group}
                    control={control}
                    readOnly={readOnly}
                    onVerify={setVerify}
                    onPublish={(keys) => {
                      setPublicationState("pending");
                      setPublicationTargets(keys);
                    }}
                  />
                )}
                {group === "content" && !readOnly && (
                  <UploadForm
                    profile={profile}
                    onDone={async () => {
                      await reload();
                      success("Asset saved.");
                    }}
                    onError={error}
                  />
                )}
                {group !== "history" &&
                  RECORD_NAMES.filter(
                    (t) => recordDefinition(t).group === group,
                  ).map((type) => (
                    <section className="panel" key={type}>
                      <div className="section-head">
                        <h2>{recordDefinition(type).label}</h2>
                        <div className="toolbar">
                          <small>Records: {profile.records[type].length}</small>
                          {!readOnly && type !== "asset" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                navigate(() => {
                                  setRecordModal({ type });
                                  setRecordDirty(false);
                                })
                              }
                            >
                              <Plus size={13} />
                              Add
                            </Button>
                          )}
                        </div>
                      </div>
                      {!profile.records[type].length ? (
                        <div>
                          <p className="muted">
                            {label(profile.collection_states[type].value_state)}
                            {profile.collection_states[type]
                              .not_applicable_reason
                              ? " · " +
                                profile.collection_states[type]
                                  .not_applicable_reason
                              : ""}
                          </p>
                          {!readOnly && (
                            <div className="toolbar">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  navigate(
                                    () =>
                                      void action(
                                        () =>
                                          call(
                                            "setCollectionState",
                                            {
                                              ...versionArgs,
                                              record_type: type,
                                              state: {
                                                value_state: "known",
                                                not_applicable_reason: "",
                                              },
                                            },
                                            true,
                                          ),
                                        "Confirmed: no records in this category",
                                      ),
                                  )
                                }
                              >
                                Confirm none
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  navigate(() => {
                                    const reason = window.prompt(
                                      "Enter a reason this does not apply.",
                                    );
                                    if (reason)
                                      void action(() =>
                                        call(
                                          "setCollectionState",
                                          {
                                            ...versionArgs,
                                            record_type: type,
                                            state: {
                                              value_state: "not_applicable",
                                              not_applicable_reason: reason,
                                            },
                                          },
                                          true,
                                        ),
                                      );
                                  })
                                }
                              >
                                Not applicable
                              </Button>
                            </div>
                          )}
                        </div>
                      ) : (
                        profile.records[type].map((record) => (
                          <article className="record" key={record.record_id}>
                            <div className="record-top">
                              <strong>{recordTitle(record)}</strong>
                              <div className="toolbar">
                                <span className="badge gray">
                                  {label(record.metadata.verification_state)}
                                </span>
                                <span className="badge gray">
                                  {label(record.metadata.publication_state)}
                                </span>
                                {((record.values.valid_to &&
                                  String(record.values.valid_to) <
                                    profile.as_of_date) ||
                                  (record.metadata.valid_to &&
                                    record.metadata.valid_to <
                                      profile.as_of_date)) && (
                                  <span className="badge amber">Expired</span>
                                )}
                                {((record.values.valid_from &&
                                  String(record.values.valid_from) >
                                    profile.as_of_date) ||
                                  (record.metadata.valid_from &&
                                    record.metadata.valid_from >
                                      profile.as_of_date)) && (
                                  <span className="badge gray">
                                    Not yet effective
                                  </span>
                                )}
                                {record.needs_review && (
                                  <span className="badge amber">
                                    Supporting facts changed; review needed
                                  </span>
                                )}
                              </div>
                            </div>
                            <dl className="record-fields">
                              {recordDefinition(type)
                                .fields.filter(
                                  (f) => record.values[f.key] !== undefined,
                                )
                                .map((f) => (
                                  <div key={f.key}>
                                    <dt>{f.label}: </dt>
                                    <dd>
                                      {f.ref
                                        ? referenceText(profile, record, f.key)
                                        : display(record.values[f.key])}
                                    </dd>
                                  </div>
                                ))}
                            </dl>
                            {record.file && (
                              <p>
                                <a
                                  href={
                                    "/api/files?" +
                                    new URLSearchParams({
                                      merchant_id: profile.merchant_id,
                                      profile_version: String(
                                        profile.profile_version,
                                      ),
                                      asset_id: record.record_id,
                                      projection: "workspace",
                                    })
                                  }
                                >
                                  Download attachment · {size(record.file.size)}
                                </a>
                                {record.file.width
                                  ? ` · ${record.file.width} × ${record.file.height}`
                                  : ""}
                              </p>
                            )}
                            <details style={{ marginTop: 8 }}>
                              <summary className="muted">
                                Source &amp; references
                              </summary>
                              <p>
                                Record ID:{record.record_id}
                                <br />
                                Source:
                                {record.metadata.source_note || "Not recorded"}
                                <br />
                                Verified at:
                                {record.metadata.verified_at || "Unverified"}
                                <br />
                                Notes:{record.metadata.note || "None"}
                              </p>
                            </details>
                            {!readOnly && (
                              <div
                                className="toolbar"
                                style={{ marginTop: 12 }}
                              >
                                {!recordDefinition(type).immutable && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      navigate(() => {
                                        setRecordModal({ type, record });
                                        setRecordDirty(false);
                                      })
                                    }
                                  >
                                    Edit
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    navigate(() =>
                                      setVerify([
                                        type + ":" + record.record_id,
                                      ]),
                                    )
                                  }
                                >
                                  Verify record
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    navigate(() => {
                                      setPublicationState(
                                        record.metadata.publication_state,
                                      );
                                      setPublicationTargets([
                                        type + ":" + record.record_id,
                                      ]);
                                    })
                                  }
                                >
                                  Visibility
                                </Button>
                                {!["snapshot", "asset"].includes(type) && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() =>
                                      navigate(() => {
                                        if (
                                          window.confirm(
                                            "Remove this current record? History is retained. Referenced records cannot be removed.",
                                          )
                                        )
                                          void action(
                                            () =>
                                              call(
                                                "removeRecord",
                                                {
                                                  ...versionArgs,
                                                  record_type: type,
                                                  record_id: record.record_id,
                                                },
                                                true,
                                              ),
                                            "Record removed.",
                                          );
                                      })
                                    }
                                  >
                                    Remove
                                  </Button>
                                )}
                                {recordDefinition(type).immutable && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      navigate(() => {
                                        setRecordModal({
                                          type,
                                          record: {
                                            ...record,
                                            record_id:
                                              undefined as unknown as string,
                                            values: {
                                              ...record.values,
                                              corrects_id: record.record_id,
                                            },
                                          },
                                        });
                                        setRecordDirty(false);
                                      })
                                    }
                                  >
                                    Add correction
                                  </Button>
                                )}
                              </div>
                            )}
                          </article>
                        ))
                      )}
                    </section>
                  ))}
                {group === "history" && (
                  <section className="panel">
                    <h2>Change history</h2>
                    <p className="muted">
                      Historical versions are read only. Edit the current
                      profile to reinstate a previous value.
                    </p>
                    {history.map((h) => (
                      <article className="history-item" key={h.version}>
                        <div className="section-head">
                          <strong>
                            Version {h.version} ·{" "}
                            {(
                              {
                                create: "Create profile",
                                edit_group: "Edit section",
                                edit_record: "Edit record",
                                verification: "Verify facts",
                                publication: "Visibility",
                                brand_update: "Update brand",
                                archive: "Archive",
                                restore_archive: "Restore archive",
                                upload_asset: "Upload asset",
                                remove_record: "Remove record",
                                collection_state: "Collection status",
                              } as Record<string, string>
                            )[h.type] || h.type}
                          </strong>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              openMerchant(profile.merchant_id, h.version)
                            }
                          >
                            View version
                          </Button>
                        </div>
                        <small>{time(h.at)}</small>
                        <details>
                          <summary>
                            View changes ({h.changes.length} items)
                          </summary>
                          {h.changes.map((c, i) => (
                            <div key={i}>
                              <p style={{ marginTop: 12 }}>{c.path}</p>
                              <pre>
                                {JSON.stringify(
                                  { before: c.before, after: c.after },
                                  null,
                                  2,
                                )}
                              </pre>
                            </div>
                          ))}
                        </details>
                      </article>
                    ))}
                  </section>
                )}
              </div>
            </div>
          </>
        )}
        {section === "brands" && (
          <>
            <header className="topline">
              <div>
                <h1>Brands</h1>
                <p>
                  Shared brand identity. Updating a brand creates new versions
                  for its restaurants.
                </p>
              </div>
              <Button onClick={() => setBrandModal(null)}>
                <Plus size={15} />
                Add brand
              </Button>
            </header>
            <section className="panel">
              {brands.length ? (
                brands.map((b) => (
                  <article className="record" key={b.brand_id}>
                    <div className="record-top">
                      <strong>{b.name}</strong>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setBrandModal(b)}
                      >
                        Edit brand
                      </Button>
                    </div>
                    <p className="muted">
                      Version {b.brand_version} · {label(b.publication_state)} ·{" "}
                      {b.aliases.join(", ") || "No alternate names recorded"}
                    </p>
                    <p>{b.description || "No brand description"}</p>
                  </article>
                ))
              ) : (
                <div className="empty">
                  <strong>No brands yet</strong>
                  <p>
                    Independent restaurants do not need a brand association.
                  </p>
                </div>
              )}
            </section>
          </>
        )}
        {section === "backup" && (
          <>
            <header className="topline">
              <div>
                <h1>Backup &amp; restore</h1>
                <p>
                  Includes brands, restaurants, history, internal records and
                  attachment files
                </p>
              </div>
              <Button disabled={busy} onClick={() => backupAction("create")}>
                <Database size={15} />
                {busy ? "Working…" : "Create full backup"}
              </Button>
            </header>
            <section className="panel">
              <h2>Restore from backup</h2>
              <p className="muted">
                Validate a backup and review its summary before replacing the
                workstation. Current data is backed up before replacement.
              </p>
              <input
                aria-label="Choose backup file"
                type="file"
                accept=".zip"
                disabled={busy}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setBusy(true);
                  try {
                    const r = await fetch("/api/backup/upload", {
                      method: "POST",
                      headers: { "Content-Type": "application/zip" },
                      body: file,
                    }).then((r) => r.json());
                    if (!r.ok)
                      throw new Error(
                        r.error?.message || "Backup validation failed.",
                      );
                    setPrepared(r.data);
                  } catch (err) {
                    error((err as Error).message);
                  } finally {
                    setBusy(false);
                    e.target.value = "";
                  }
                }}
              />
            </section>
            <section className="panel">
              <div className="section-head">
                <h2>Available backups</h2>
                <Button variant="ghost" size="sm" onClick={refreshBackup}>
                  <RefreshCw size={13} />
                  Refresh
                </Button>
              </div>
              <p className="muted">
                The first launch each day creates a backup. The latest 7
                automatic backups are kept; manual backups are retained. Keep a
                copy on another drive.
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Backup</th>
                      <th>Created at</th>
                      <th>Size</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backups.map((b) => (
                      <tr key={b.name}>
                        <td>
                          <strong>
                            {b.name.startsWith("auto-")
                              ? "Daily automatic backup"
                              : "Manual full backup"}
                          </strong>
                          <br />
                          <small>{b.name}</small>
                        </td>
                        <td>{time(b.created_at)}</td>
                        <td>{size(b.size)}</td>
                        <td>
                          <div className="toolbar">
                            <a
                              href={
                                "/api/backup/download?" +
                                new URLSearchParams({ name: b.name })
                              }
                            >
                              Download
                            </a>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busy}
                              onClick={() =>
                                backupAction("prepare", { name: b.name })
                              }
                            >
                              Validate &amp; restore
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
      {newModal && (
        <NewMerchant
          brands={brands}
          onClose={() => setNewModal(false)}
          onError={error}
          onCreated={async (p) => {
            setNewModal(false);
            await openMerchant(p.merchant_id);
          }}
        />
      )}
      {brandModal !== false && (
        <BrandForm
          brand={brandModal}
          onError={error}
          onClose={() => setBrandModal(false)}
          onDone={() => {
            setBrandModal(false);
            setRefreshTick((t) => t + 1);
            success("Brand saved. Associated restaurant versions updated.");
          }}
        />
      )}
      {recordModal && profile && (
        <Modal
          title={
            (recordModal.record?.record_id ? "Edit " : "Add ") +
            recordDefinition(recordModal.type).label
          }
          onClose={closeRecord}
          large
        >
          <RecordForm
            key={profile.profile_version + recordModal.type}
            profile={profile}
            type={recordModal.type}
            record={recordModal.record}
            onError={error}
            onCancel={closeRecord}
            onDirty={setRecordDirty}
            onSaveRegister={(fn) => {
              recordSave.current = fn;
            }}
            onDone={async (continueAdding = false) => {
              const type = recordModal.type;
              if (!continueAdding) setRecordModal(null);
              setRecordDirty(false);
              await reload();
              if (continueAdding) setRecordModal({ type });
              success("Record saved. Ready for another.");
            }}
          />
        </Modal>
      )}
      {closeRecordPrompt && (
        <Modal
          title="This record has unsaved changes"
          onClose={() => setCloseRecordPrompt(false)}
        >
          <p>Save, discard changes or keep editing.</p>
          <div className="toolbar">
            <Button
              onClick={async () => {
                if (await recordSave.current?.()) setCloseRecordPrompt(false);
              }}
            >
              Save and close
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setRecordModal(null);
                setRecordDirty(false);
                setCloseRecordPrompt(false);
              }}
            >
              Discard changes
            </Button>
            <Button variant="ghost" onClick={() => setCloseRecordPrompt(false)}>
              Keep editing
            </Button>
          </div>
        </Modal>
      )}
      {verify && profile && (
        <Modal title="Verify selected facts" onClose={() => setVerify(null)}>
          <VerifyForm
            profile={profile}
            targets={verify}
            onError={error}
            onDone={async () => {
              setVerify(null);
              await reload();
              success("Verification status updated.");
            }}
          />
        </Modal>
      )}
      {publicationTargets && profile && (
        <Modal
          title="Set visibility for selected facts"
          onClose={() => setPublicationTargets(null)}
        >
          <p>
            Update only the selected {publicationTargets.length} items. Public
            visibility does not mean verified.
          </p>
          <label>
            <span>Visibility</span>
            <select
              value={publicationState}
              onChange={(e) => setPublicationState(e.target.value)}
            >
              {["pending", "public", "internal"].map((s) => (
                <option key={s} value={s}>
                  {label(s)}
                </option>
              ))}
            </select>
          </label>
          <div className="form-actions">
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await call(
                    "setPublication",
                    {
                      ...versionArgs,
                      targets: publicationTargets,
                      publication_state: publicationState,
                    },
                    true,
                  );
                  setPublicationTargets(null);
                  await reload();
                  success("Visibility updated.");
                } catch (e) {
                  error((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Confirm visibility
            </Button>
          </div>
        </Modal>
      )}
      {pending && (
        <Modal
          title="This section has unsaved changes"
          onClose={() => setPending(null)}
        >
          <p>Save and leave, discard changes or keep editing this section.</p>
          <div className="toolbar">
            <Button
              onClick={async () => {
                if (await saveRef.current?.()) {
                  const fn = pending;
                  setPending(null);
                  fn();
                }
              }}
            >
              Save and leave
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const fn = pending;
                setPending(null);
                setDirty(false);
                setRevision((r) => r + 1);
                fn();
              }}
            >
              Discard changes
            </Button>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Keep editing
            </Button>
          </div>
        </Modal>
      )}
      {exportModal && profile && (
        <Modal
          title="Export public profile"
          onClose={() => setExportModal(false)}
        >
          <p className="muted">
            Includes only known, currently valid facts explicitly marked public.
            Internal records, notes, pending facts and original evidence are
            excluded.
          </p>
          <p>
            Profile version {profile.profile_version} · As of{" "}
            {profile.as_of_date}
          </p>
          <h3>Selected public assets</h3>
          {profile.records.asset
            .filter(
              (a) =>
                a.metadata.publication_state === "public" &&
                a.values.usage !== "disabled",
            )
            .map((a) => (
              <label className="checkbox-row" key={a.record_id}>
                <input
                  type="checkbox"
                  checked={exportAssets.includes(a.record_id)}
                  onChange={(e) =>
                    setExportAssets(
                      e.target.checked
                        ? [...exportAssets, a.record_id]
                        : exportAssets.filter((id) => id !== a.record_id),
                    )
                  }
                />
                {recordTitle(a)}
              </label>
            ))}
          <div className="form-actions">
            {["markdown", "json"].map((format) => (
              <Button
                key={format}
                variant={format === "json" ? "outline" : "default"}
                onClick={async () => {
                  try {
                    const data = await call<{
                      markdown: string;
                      json: unknown;
                    }>("exportMerchant", {
                      merchant_id: profile.merchant_id,
                      profile_version: profile.profile_version,
                      as_of_date: profile.as_of_date,
                      asset_ids: exportAssets,
                    });
                    const blob = new Blob(
                      [
                        format === "json"
                          ? JSON.stringify(data.json, null, 2)
                          : data.markdown,
                      ],
                      {
                        type:
                          format === "json"
                            ? "application/json"
                            : "text/markdown;charset=utf-8",
                      },
                    );
                    const url = URL.createObjectURL(blob),
                      a = document.createElement("a");
                    a.href = url;
                    a.download = `merchant-${profile.merchant_id}-v${profile.profile_version}.${format === "json" ? "json" : "md"}`;
                    a.click();
                    URL.revokeObjectURL(url);
                  } catch (e) {
                    error((e as Error).message);
                  }
                }}
              >
                Export {format === "json" ? "JSON" : "Markdown"}
              </Button>
            ))}
            <Button
              variant="outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const response = await fetch("/api/export", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      merchant_id: profile.merchant_id,
                      profile_version: profile.profile_version,
                      as_of_date: profile.as_of_date,
                      asset_ids: exportAssets,
                    }),
                  });
                  if (!response.ok) {
                    const r = await response.json();
                    throw new Error(r.error?.message || "Export failed.");
                  }
                  const url = URL.createObjectURL(await response.blob()),
                    link = document.createElement("a");
                  link.href = url;
                  link.download = "public-materials.zip";
                  link.click();
                  URL.revokeObjectURL(url);
                } catch (e) {
                  error((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Creating package…" : "Export profile & assets"}
            </Button>
          </div>
        </Modal>
      )}
      {prepared && (
        <Modal
          title="Confirm full restore"
          onClose={() => {
            if (!busy) void backupAction("discard", { token: prepared.token });
          }}
        >
          <p className="muted">
            Validation passed. Restoring replaces the entire F1 workstation.
            Records are not merged by name.
          </p>
          <div className="grid2">
            <p>
              Backup timestamp
              <br />
              <strong>{time(prepared.created_at)}</strong>
            </p>
            <p>
              Restaurant
              <br />
              <strong>{prepared.merchants} restaurants</strong>
            </p>
            <p>
              Historical versions
              <br />
              <strong>{prepared.versions} versions</strong>
            </p>
            <p>
              Attachments
              <br />
              <strong>
                {prepared.assets} files · {size(prepared.asset_bytes)}
              </strong>
            </p>
          </div>
          <p>
            Current data will be backed up first. Replacement stops if that
            backup fails.
          </p>
          <div className="form-actions">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => backupAction("discard", { token: prepared.token })}
            >
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={() => backupAction("restore", { token: prepared.token })}
            >
              {busy ? "Backing up and restoring…" : "Replace current data"}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function referenceText(p: Profile, r: MerchantRecord, key: string) {
  const def = recordDefinition(r.record_type).fields.find((f) => f.key === key);
  const type = def?.ref?.startsWith("$")
    ? String(r.values[def.ref.slice(1)])
    : def?.ref;
  const ids = Array.isArray(r.values[key])
    ? (r.values[key] as string[])
    : [String(r.values[key])];
  return ids
    .map((id) => p.records[type as RecordType]?.find((x) => x.record_id === id))
    .map((x, i) => (x ? recordTitle(x) : ids[i]))
    .join(", ");
}
function NewMerchant({
  brands,
  onClose,
  onError,
  onCreated,
}: {
  brands: Brand[];
  onClose: () => void;
  onError: (v: string) => void;
  onCreated: (p: Profile) => Promise<void>;
}) {
  const [name, setName] = useState(""),
    [region, setRegion] = useState(""),
    [address, setAddress] = useState(""),
    [city, setCity] = useState(""),
    [state, setState] = useState(""),
    [postalCode, setPostalCode] = useState(""),
    [timezone, setTimezone] = useState(""),
    [cuisines, setCuisines] = useState(""),
    [brand, setBrand] = useState(""),
    [newBrand, setNewBrand] = useState(""),
    [candidates, setCandidates] = useState<
      Pick<Summary, "merchant_id" | "name" | "address">[]
    >([]),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (name.trim().length < 2) {
      setCandidates([]);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      void call<{ items: Pick<Summary, "merchant_id" | "name" | "address">[] }>(
        "findMerchantDuplicates",
        {
          name,
          address,
        },
      )
        .then((r) => {
          if (active) setCandidates(r.items);
        })
        .catch(() => {});
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [name, address]);
  async function save() {
    setBusy(true);
    try {
      const brandId = brand === "independent" || brand === "new" ? null : brand;
      const p = await call<Profile>(
        "createMerchant",
        {
          display_name: name,
          region,
          address,
          city,
          state,
          postal_code: postalCode,
          timezone,
          primary_cuisines: cuisines
            .split(/[,，]/)
            .map((x) => x.trim())
            .filter(Boolean),
          brand_id: brandId,
          ...(brand === "new" ? { new_brand: { name: newBrand } } : {}),
        },
        true,
      );
      await onCreated(p);
      return true;
    } catch (e) {
      onError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Add restaurant"
      onClose={onClose}
      dirty={
        !!(
          name ||
          region ||
          address ||
          city ||
          state ||
          postalCode ||
          timezone ||
          cuisines ||
          brand ||
          newBrand
        )
      }
      onSave={save}
    >
      <p className="muted">
        Create an English-language profile for a U.S. restaurant. Add more
        details after setup.
      </p>
      <div className="grid2">
        <label className="field wide">
          <span>Restaurant name *</span>
          <input
            aria-label="Restaurant name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          <span>Market / region *</span>
          <input
            aria-label="Market / region"
            placeholder="Example: Austin, TX"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
          />
        </label>
        <label>
          <span>Primary cuisines *</span>
          <input
            aria-label="Primary cuisines"
            placeholder="Separate items with commas"
            value={cuisines}
            onChange={(e) => setCuisines(e.target.value)}
          />
        </label>
        <label className="field wide">
          <span>Street address *</span>
          <input
            aria-label="Street address"
            placeholder="Example: 100 Example St, Suite 200"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </label>
        <label>
          <span>City</span>
          <input
            aria-label="City"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </label>
        <label>
          <span>State / territory</span>
          <select
            aria-label="State / territory"
            value={state}
            onChange={(e) => setState(e.target.value)}
          >
            <option value="">Not yet recorded</option>
            {US_STATES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>ZIP Code</span>
          <input
            aria-label="ZIP Code"
            value={postalCode}
            placeholder="78701 or 78701-1234"
            onChange={(e) => setPostalCode(e.target.value)}
          />
        </label>
        <label>
          <span>Restaurant time zone *</span>
          <select
            aria-label="Restaurant time zone"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          >
            <option value="">Select the actual local time zone</option>
            {US_TIMEZONES.map((zone) => (
              <option key={zone} value={zone}>
                {zone.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="field wide">
          <small>
            Country: US · Currency: USD. Dates use YYYY-MM-DD; hours use local
            restaurant time. Original-language names belong in alternate names
            or source snapshots.
          </small>
        </label>
        <label className="field wide">
          <span>Brand association *</span>
          <select
            aria-label="Brand association"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
          >
            <option value="">Select an option</option>
            <option value="independent">Independent restaurant</option>
            {brands.map((b) => (
              <option key={b.brand_id} value={b.brand_id}>
                {b.name}
              </option>
            ))}
            <option value="new">Add a new brand…</option>
          </select>
        </label>
        {brand === "new" && (
          <label className="field wide">
            <span>New brand name *</span>
            <input
              value={newBrand}
              onChange={(e) => setNewBrand(e.target.value)}
            />
          </label>
        )}
      </div>
      {candidates.length > 0 && (
        <div className="alert" style={{ display: "block", marginTop: 20 }}>
          <strong>Similar restaurants found. Check for duplicates.</strong>
          {candidates.map((c) => (
            <p key={c.merchant_id} style={{ margin: "8px 0" }}>
              {c.name} · {c.address}
              <br />
              <button
                className="link-button"
                onClick={() =>
                  onCreated({ merchant_id: c.merchant_id } as Profile)
                }
              >
                View existing restaurant
              </button>
            </p>
          ))}
          <small>
            Locations with the same name may be created separately. No automatic
            merging occurs.
          </small>
        </div>
      )}
      <div className="form-actions">
        <ModalCancel />
        <Button
          disabled={
            busy ||
            !name.trim() ||
            !region.trim() ||
            !address.trim() ||
            !cuisines.trim() ||
            !timezone ||
            !brand ||
            (brand === "new" && !newBrand.trim())
          }
          onClick={save}
        >
          {busy
            ? "Creating profile…"
            : candidates.length
              ? "Create anyway"
              : "Create and open profile"}
        </Button>
      </div>
    </Modal>
  );
}
function BrandForm({
  brand,
  onClose,
  onError,
  onDone,
}: {
  brand: Brand | null;
  onClose: () => void;
  onError: (v: string) => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(brand?.name || ""),
    [aliases, setAliases] = useState(brand?.aliases.join("，") || ""),
    [year, setYear] = useState(brand?.founded_year || ""),
    [description, setDescription] = useState(brand?.description || ""),
    [publication, setPublication] = useState(
      brand?.publication_state || "pending",
    ),
    [busy, setBusy] = useState(false);
  const changed =
    name !== (brand?.name || "") ||
    aliases !== (brand?.aliases.join("，") || "") ||
    year !== (brand?.founded_year || "") ||
    description !== (brand?.description || "") ||
    publication !== (brand?.publication_state || "pending");
  async function save() {
    setBusy(true);
    try {
      await call(
        brand ? "updateBrand" : "createBrand",
        {
          brand_id: brand?.brand_id,
          expected_brand_version: brand?.brand_version,
          name,
          aliases: aliases
            .split(/[,，]/)
            .map((x) => x.trim())
            .filter(Boolean),
          founded_year: year,
          description,
          publication_state: publication,
        },
        true,
      );
      onDone();
      return true;
    } catch (e) {
      onError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={brand ? "Edit shared brand" : "Add brand"}
      onClose={onClose}
      dirty={changed}
      onSave={save}
    >
      <div className="grid2">
        <label>
          <span>Brand name *</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          <span>Founded year</span>
          <input value={year} onChange={(e) => setYear(e.target.value)} />
        </label>
        <label>
          <span>Alternate names</span>
          <input value={aliases} onChange={(e) => setAliases(e.target.value)} />
        </label>
        <label>
          <span>Visibility</span>
          <select
            value={publication}
            onChange={(e) =>
              setPublication(e.target.value as Brand["publication_state"])
            }
          >
            {["pending", "public", "internal"].map((v) => (
              <option key={v} value={v}>
                {label(v)}
              </option>
            ))}
          </select>
        </label>
        <label className="field wide">
          <span>Brand description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
      </div>
      <div className="form-actions">
        <ModalCancel />
        <Button disabled={busy || !name.trim()} onClick={save}>
          {busy ? "Saving…" : "Save brand"}
        </Button>
      </div>
    </Modal>
  );
}
function UploadForm({
  profile,
  onDone,
  onError,
}: {
  profile: Profile;
  onDone: () => Promise<void>;
  onError: (v: string) => void;
}) {
  const [category, setCategory] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false);
  return (
    <section className="panel">
      <h2>Upload asset</h2>
      <p className="muted">
        Store a file copy for media, related records or verification evidence.
      </p>
      <div className="grid2">
        <label>
          <span>Category / purpose *</span>
          <input
            placeholder="Example: menu, storefront, agreement, internal evidence"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
        </label>
        <label>
          <span>File *</span>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </label>
      </div>
      <div className="form-actions">
        <Button
          disabled={busy || !category.trim() || !file}
          onClick={async () => {
            if (!file) return;
            setBusy(true);
            try {
              const form = new FormData();
              form.set("merchant_id", profile.merchant_id);
              form.set(
                "expected_profile_version",
                String(profile.profile_version),
              );
              form.set("category", category);
              form.set("file", file);
              const r = await fetch("/api/files", {
                method: "POST",
                body: form,
              }).then((r) => r.json());
              if (!r.ok) throw new Error(r.error?.message || "Upload failed.");
              setFile(null);
              await onDone();
            } catch (e) {
              onError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Uploading…" : "Upload and save"}
        </Button>
      </div>
    </section>
  );
}
