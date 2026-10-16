import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useEffect, useState } from "react";
import { auditRequest } from "@/components/audits/audit-client";
import { AuditError, AuditLayout, auditButtonClass, auditInputClass } from "@/components/audits/audit-layout";

export const Route = createFileRoute("/free-report")({
	head: () => ({ meta: [{ title: "Free Restaurant AI Visibility Report" }, { name: "robots", content: "noindex" }] }),
	component: FreeRestaurantReport,
});

function FreeRestaurantReport() {
	const [available, setAvailable] = useState<boolean | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	useEffect(() => {
		auditRequest<{ enabled: boolean; reason?: string }>("/api/public-audits/availability")
			.then((result) => {
				setAvailable(result.enabled);
				if (!result.enabled)
					setMessage(result.reason ?? "New reports are temporarily paused. Existing reports are still accessible.");
			})
			.catch(() => {
				setAvailable(false);
				setMessage("New reports are temporarily unavailable. Please try again later.");
			});
	}, []);
	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setBusy(true);
		setError(null);
		const data = new FormData(event.currentTarget);
		try {
			await auditRequest("/api/public-audits", { website: data.get("website"), email: data.get("email") });
			setMessage(
				"Check your email for a verification link. After verifying, you can confirm the restaurant location and start your report.",
			);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Unable to request a report.");
		} finally {
			setBusy(false);
		}
	}
	return (
		<AuditLayout>
			<div className="grid gap-12 lg:grid-cols-2">
				<section>
					<p className="mb-3 text-sm font-semibold uppercase tracking-widest text-slate-600">
						One location. Clear evidence.
					</p>
					<h1 className="text-4xl font-bold tracking-tight">Find out how AI sees your restaurant.</h1>
					<p className="mt-6 text-lg text-slate-600">
						Get a free English report covering website readiness, AI mentions, recommendations, location accuracy,
						competitor mentions and practical next steps.
					</p>
					<ul className="mt-6 space-y-3 text-sm">
						<li>10 English questions across two model APIs.</li>
						<li>Website technical readiness and AI visibility shown separately.</li>
						<li>An online report and downloadable PDF, with missing results clearly marked.</li>
					</ul>
				</section>
				<section className="rounded-xl border border-slate-200 bg-white p-7">
					<h2 className="text-xl font-semibold">Run your free restaurant report</h2>
					<p className="mt-2 text-sm text-slate-600">For US restaurants. No account or credit card required.</p>
					<form onSubmit={submit} className="mt-6 space-y-5">
						<label className="block text-sm font-medium">
							Restaurant website
							<input
								className={`${auditInputClass} mt-2`}
								name="website"
								type="url"
								placeholder="https://yourrestaurant.com"
								autoComplete="url"
								required
								maxLength={2000}
							/>
						</label>
						<label className="block text-sm font-medium">
							Email address
							<input
								className={`${auditInputClass} mt-2`}
								name="email"
								type="email"
								autoComplete="email"
								required
								maxLength={254}
							/>
						</label>
						<p className="text-xs text-slate-600">
							We will email your verification and report access links. Reports are retained for 30 days. Email
							verification does not establish website ownership.
						</p>
						<AuditError message={error} />
						{message && (
							<p role="status" className="rounded-md bg-slate-100 p-3 text-sm">
								{message}
							</p>
						)}
						<button type="submit" className={auditButtonClass} disabled={busy || available !== true}>
							{busy ? "Sending…" : available === null ? "Checking availability…" : "Email my verification link"}
						</button>
					</form>
				</section>
			</div>
		</AuditLayout>
	);
}
