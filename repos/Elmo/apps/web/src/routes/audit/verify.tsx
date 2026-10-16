import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { auditRequest } from "@/components/audits/audit-client";
import { AuditError, AuditLayout, auditButtonClass } from "@/components/audits/audit-layout";

export const Route = createFileRoute("/audit/verify")({
	head: () => ({
		meta: [
			{ title: "Verify report access" },
			{ name: "robots", content: "noindex, nofollow" },
			{ name: "referrer", content: "no-referrer" },
		],
	}),
	component: VerifyAudit,
});

function VerifyAudit() {
	const credentials = useRef<{ auditId: string; token: string } | null>(null);
	const [ready, setReady] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		const search = new URLSearchParams(window.location.search);
		const fragment = new URLSearchParams(window.location.hash.slice(1));
		credentials.current = {
			auditId: search.get("auditId") ?? fragment.get("auditId") ?? "",
			token: fragment.get("token") ?? search.get("token") ?? "",
		};
		window.history.replaceState(null, "", "/audit/verify");
		setReady(Boolean(credentials.current.auditId && credentials.current.token));
	}, []);
	async function verify() {
		if (!credentials.current) return;
		setBusy(true);
		setError(null);
		try {
			const result = await auditRequest<{ auditId: string }>("/api/public-audits/verify", credentials.current);
			window.location.assign(`/audit/${encodeURIComponent(result.auditId)}`);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Unable to verify this link.");
			setBusy(false);
		}
	}
	return (
		<AuditLayout>
			<section className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-7">
				<h1 className="text-2xl font-bold">Open your restaurant report</h1>
				<p className="my-5 text-sm text-slate-600">
					Click below to verify your email and continue. Opening this page alone does not use your link.
				</p>
				<AuditError message={error} />
				{!ready && (
					<p className="my-4 text-sm">
						Please open the full link in your email, or{" "}
						<a href="/audit/access" className="underline">
							request a new access link
						</a>
						.
					</p>
				)}
				<button type="button" className={`${auditButtonClass} mt-5`} disabled={!ready || busy} onClick={verify}>
					{busy ? "Verifying…" : "Verify email and continue"}
				</button>
			</section>
		</AuditLayout>
	);
}
