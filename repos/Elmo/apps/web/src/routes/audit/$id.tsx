import { createFileRoute } from "@tanstack/react-router";
import type { AuditReportSnapshot, RestaurantSubject } from "@workspace/lib/audits/contracts";
import { type FormEvent, useEffect, useState } from "react";
import { auditRequest } from "@/components/audits/audit-client";
import { AuditError, AuditLayout, auditButtonClass, auditInputClass } from "@/components/audits/audit-layout";
import { AuditReport } from "@/components/audits/audit-report";

export const Route = createFileRoute("/audit/$id")({
	head: () => ({
		meta: [
			{ title: "Your restaurant AI visibility report" },
			{ name: "robots", content: "noindex, nofollow" },
			{ name: "referrer", content: "no-referrer" },
		],
	}),
	component: CustomerAudit,
});

type AuditStatus = {
	auditId: string;
	status: string;
	progress?: number;
	samples?: { planned: number; collected: number; judged: number; failed: number };
	reportVersion?: number | null;
	pdfStatus?: string;
};
type SubjectResult = {
	website: string;
	candidates: Partial<RestaurantSubject>[];
	subject?: Partial<RestaurantSubject>;
};
type AuditView = { status: AuditStatus; subject?: SubjectResult; report?: AuditReportSnapshot };

async function loadAuditView(id: string): Promise<AuditView> {
	const status = await auditRequest<AuditStatus>(`/api/public-audits/${id}`);
	const view: AuditView = { status };
	if (status.status === "awaiting_confirmation")
		view.subject = await auditRequest<SubjectResult>(`/api/public-audits/${id}/subject`);
	if (status.reportVersion) view.report = await auditRequest<AuditReportSnapshot>(`/api/public-audits/${id}/report`);
	return view;
}
function shouldRefresh(view: AuditView): boolean {
	if (view.status.status === "awaiting_confirmation") return false;
	if (["queued", "running", "preparing_subject"].includes(view.status.status)) return true;
	if (view.report) return !["succeeded", "ready", "failed"].includes(view.status.pdfStatus ?? "");
	return !["failed", "expired", "deleted"].includes(view.status.status);
}
function errorMessage(cause: unknown): string {
	return cause instanceof Error ? cause.message : "Unable to load your report.";
}

function useAuditView(id: string) {
	const [view, setView] = useState<AuditView | null>(null);
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		let disposed = false;
		let timer: ReturnType<typeof setTimeout>;
		async function refresh() {
			try {
				const next = await loadAuditView(id);
				if (disposed) return;
				setView(next);
				setError(null);
				if (shouldRefresh(next)) timer = setTimeout(refresh, 4000);
			} catch (cause) {
				if (!disposed) setError(errorMessage(cause));
			}
		}
		void refresh();
		return () => {
			disposed = true;
			clearTimeout(timer);
		};
	}, [id]);
	return { view, error };
}

function CustomerAudit() {
	const { id } = Route.useParams();
	const { view, error } = useAuditView(id);
	return (
		<AuditLayout>
			<AuditError message={error} />
			{error && (
				<p className="my-4 text-sm">
					<a className="underline" href="/audit/access">
						Request a fresh access link
					</a>
				</p>
			)}
			{!error && <AuditContent id={id} view={view} />}
		</AuditLayout>
	);
}
function AuditContent({ id, view }: { id: string; view: AuditView | null }) {
	if (view?.report)
		return (
			<>
				{["queued", "running"].includes(view.status.status) && (
					<p role="status" className="mb-6 rounded border bg-white p-4 text-sm">
						Additional checks are in progress. This page will update when the revised report is ready.
					</p>
				)}
				<AuditReport report={view.report} pdfStatus={view.status.pdfStatus} />
			</>
		);
	if (view?.subject) return <LocationConfirmation id={id} initial={view.subject} />;
	return <AuditProgress status={view?.status} />;
}
function AuditProgress({ status }: { status?: AuditStatus }) {
	const isFailed = status?.status === "failed";
	return (
		<section className="mx-auto max-w-2xl rounded-xl border bg-white p-7">
			<h1 className="text-2xl font-bold">
				{isFailed ? "This report could not be completed" : "Your restaurant report"}
			</h1>
			<p className="my-4 text-sm text-slate-600">
				{status?.status === "preparing_subject"
					? "Reading your website to find location details. You can review and correct them before AI detection starts."
					: "Each completed answer is saved separately. Successful results will be preserved if another task fails."}
			</p>
			{status ? (
				<p role="status" className="rounded bg-slate-100 p-4 text-sm">
					Stage: {status.status.replaceAll("_", " ")}
					{status.samples && (
						<span>
							{" "}
							· {status.samples.collected}/{status.samples.planned} answers collected · {status.samples.failed} failed
						</span>
					)}
				</p>
			) : (
				<p role="status">Loading…</p>
			)}
			<p className="mt-4 text-sm text-slate-600">
				You can leave this page. We will email you when the report is ready.
			</p>
		</section>
	);
}

function LocationConfirmation({ id, initial }: { id: string; initial: SubjectResult }) {
	const [subject, setSubject] = useState(initial);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const candidate = subject.subject ?? (subject.candidates.length === 1 ? subject.candidates[0] : undefined);
	async function confirm(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setBusy(true);
		setError(null);
		const data = new FormData(event.currentTarget);
		try {
			const result = await auditRequest<AuditStatus>(`/api/public-audits/${id}/confirm`, Object.fromEntries(data));
			window.location.assign(`/audit/${encodeURIComponent(result.auditId)}`);
		} catch (cause) {
			setError(errorMessage(cause));
			setBusy(false);
		}
	}
	return (
		<section className="mx-auto max-w-2xl rounded-xl border bg-white p-7">
			<h1 className="text-2xl font-bold">Confirm one restaurant location</h1>
			<p className="my-4 text-sm text-slate-600">
				Review the details below. For chains, enter the exact street address for the location you want to test. Your
				confirmation is recorded as customer-provided information.
			</p>
			<AuditError message={error} />
			<form onSubmit={confirm} className="mt-4 space-y-4">
				<input type="hidden" name="website" value={subject.website} />
				{subject.candidates.length > 1 && (
					<label className="block text-sm">
						Multiple website locations found. Choose one or enter your location manually.
						<select
							className={`${auditInputClass} mt-2`}
							defaultValue=""
							onChange={(event) => {
								const selected = subject.candidates[Number(event.target.value)];
								if (selected) setSubject({ ...subject, subject: selected });
							}}
						>
							<option value="" disabled>
								Choose a location
							</option>
							{subject.candidates.map((item, index) => (
								<option key={`${item.name}-${item.address}`} value={index}>
									{item.name ?? "Restaurant"} — {item.address ?? item.city ?? "Location details unavailable"}
								</option>
							))}
						</select>
					</label>
				)}
				<LocationFields key={`${candidate?.name}-${candidate?.address}`} candidate={candidate} />
				<label className="flex gap-3 text-sm">
					<input type="checkbox" required />
					<span>I confirm these details identify the specific US restaurant location I want to test.</span>
				</label>
				<button type="submit" disabled={busy} className={auditButtonClass}>
					{busy ? "Starting…" : "Confirm location and start report"}
				</button>
			</form>
		</section>
	);
}
function LocationFields({ candidate }: { candidate?: Partial<RestaurantSubject> }) {
	const fields = [
		["name", "Restaurant name", candidate?.name],
		["address", "Street address", candidate?.address],
		["city", "City", candidate?.city],
		["state", "US state (two-letter code)", candidate?.state],
		["cuisine", "Cuisine (optional)", candidate?.cuisine],
	] as const;
	return (
		<div className="grid gap-4 sm:grid-cols-2">
			{fields.map(([name, label, value]) => (
				<label key={name} className="block text-sm">
					{label}
					<input
						className={`${auditInputClass} mt-2`}
						name={name}
						defaultValue={value ?? ""}
						required={name !== "cuisine"}
						maxLength={name === "state" ? 2 : 300}
						pattern={name === "state" ? "[A-Za-z]{2}" : undefined}
					/>
				</label>
			))}
		</div>
	);
}
