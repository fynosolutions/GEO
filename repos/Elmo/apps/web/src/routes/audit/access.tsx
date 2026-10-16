import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { auditRequest } from "@/components/audits/audit-client";
import { AuditError, AuditLayout, auditButtonClass, auditInputClass } from "@/components/audits/audit-layout";

export const Route = createFileRoute("/audit/access")({
	head: () => ({ meta: [{ title: "Recover restaurant report access" }, { name: "robots", content: "noindex" }] }),
	component: RecoverAudit,
});

function RecoverAudit() {
	const [busy, setBusy] = useState(false);
	const [sent, setSent] = useState(false);
	const [error, setError] = useState<string | null>(null);
	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setBusy(true);
		setError(null);
		const data = new FormData(event.currentTarget);
		try {
			await auditRequest("/api/public-audits/access-link", { email: data.get("email") });
			setSent(true);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Please try again later.");
		} finally {
			setBusy(false);
		}
	}
	return (
		<AuditLayout>
			<section className="mx-auto max-w-lg rounded-xl border bg-white p-7">
				<h1 className="text-2xl font-bold">Recover your report</h1>
				<p className="my-4 text-sm text-slate-600">
					Enter the email you used to request your report. If a matching report exists, we will send an access link.
				</p>
				<form onSubmit={submit} className="space-y-4">
					<label className="block text-sm">
						Email address
						<input
							className={`${auditInputClass} mt-2`}
							name="email"
							type="email"
							required
							autoComplete="email"
							maxLength={254}
						/>
					</label>
					<AuditError message={error} />
					{sent && (
						<p role="status" className="rounded-md bg-slate-100 p-3 text-sm">
							If a matching report exists, an access link will arrive shortly. Check your spam folder too.
						</p>
					)}
					<button type="submit" disabled={busy} className={auditButtonClass}>
						{busy ? "Sending…" : "Email an access link"}
					</button>
				</form>
			</section>
		</AuditLayout>
	);
}
