import type { ReactNode } from "react";

export function AuditLayout({ children }: { children: ReactNode }) {
	return (
		<main className="min-h-screen bg-slate-50 text-slate-900">
			<div className="mx-auto max-w-6xl px-5 py-8">
				<header className="mb-12 flex items-center justify-between border-b border-slate-200 pb-5">
					<a href="/free-report" className="text-lg font-bold">
						Restaurant AI Visibility
					</a>
					<a href="/audit/access" className="text-sm underline">
						Recover my report
					</a>
				</header>
				{children}
				<footer className="mt-14 border-t border-slate-200 py-6 text-xs text-slate-600">
					For one US restaurant location. Model API results are a sample snapshot and may differ from consumer chat
					products. Email verification does not verify website ownership.
				</footer>
			</div>
		</main>
	);
}

export const auditInputClass = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm";
export const auditButtonClass =
	"inline-flex items-center justify-center rounded-md bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50";

export function AuditError({ message }: { message: string | null }) {
	return message ? (
		<p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
			{message}
		</p>
	) : null;
}
