import type { AuditMetric, AuditReportSnapshot } from "@workspace/lib/audits/contracts";

function metric(value: AuditMetric) {
	return value.rate === null
		? "Unavailable"
		: `${value.numerator}/${value.denominator} (${Math.round(value.rate * 100)}%)`;
}
function safeLink(value: string): string | undefined {
	try {
		return ["https:", "http:"].includes(new URL(value).protocol) ? value : undefined;
	} catch {
		return undefined;
	}
}

export function AuditReport({ report, pdfStatus }: { report: AuditReportSnapshot; pdfStatus?: string }) {
	return (
		<article className="space-y-9">
			<header className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<p className="text-sm uppercase tracking-widest text-slate-500">Restaurant and Location</p>
					<h1 className="mt-2 text-3xl font-bold">{report.subject.name}</h1>
					<p className="mt-2 text-slate-600">
						{report.subject.address}, {report.subject.city}, {report.subject.state}, US
					</p>
					<p className="mt-2 text-xs text-slate-500">
						Version {report.version} · {new Date(report.createdAt).toLocaleString("en-US")} · {report.status}
					</p>
				</div>
				<div>
					<a
						className="inline-block rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium"
						href={`/api/public-audits/${encodeURIComponent(report.auditId)}/pdf?version=${report.version}`}
					>
						Download English PDF
					</a>
					{pdfStatus && pdfStatus !== "succeeded" && pdfStatus !== "ready" && (
						<p className="mt-2 max-w-60 text-xs text-slate-600">
							PDF status: {pdfStatus}. Your online report is available while the PDF is prepared.
						</p>
					)}
				</div>
			</header>
			<section className="rounded-xl border bg-white p-6">
				<h2 className="text-xl font-semibold">Executive Summary</h2>
				<div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-5">
					{Object.entries(report.counts).map(([label, count]) => (
						<div key={label}>
							<p className="text-2xl font-bold">{count}</p>
							<p className="text-sm capitalize text-slate-600">{label} samples</p>
						</div>
					))}
				</div>
				<p className="mt-5 text-sm text-slate-600">
					This report measures one batch of API answers. It does not predict whether a consumer chat product will
					recommend your restaurant.
				</p>
			</section>
			<section className="rounded-xl border bg-white p-6">
				<h2 className="text-xl font-semibold">Website Technical Readiness</h2>
				<p className="mt-4 text-3xl font-bold">
					{report.websiteTechnicalScore === null ? "Unavailable" : `${report.websiteTechnicalScore}/100`}
				</p>
				<p className="mt-2 text-sm text-slate-600">
					Technical readiness is separate from AI mentions and recommendations.
				</p>
				<dl className="mt-4 grid gap-3 sm:grid-cols-3">
					{(
						[
							["Website fetch", report.website.pageFetch],
							["Business information", report.website.businessExtraction],
							["Technical audit", report.website.websiteAudit],
						] as const
					).map(([name, stage]) => (
						<div key={name}>
							<dt className="text-sm font-medium">{name}</dt>
							<dd className="text-sm text-slate-600">
								{stage.status}
								{stage.error ? `: ${stage.error}` : ""}
							</dd>
						</div>
					))}
				</dl>
				<ul className="mt-4 space-y-2 text-sm">
					{report.website.websiteAudit.findings?.map((finding) => (
						<li key={finding.id}>
							<strong>{finding.title}</strong>: {finding.detail}
						</li>
					))}
				</ul>
				<div className="mt-4 flex flex-wrap gap-3">
					{report.website.actionChecks.map((action) => (
						<span key={action.id} className="rounded bg-slate-100 px-3 py-2 text-xs">
							{action.kind}: {action.status}
						</span>
					))}
				</div>
			</section>
			<section className="rounded-xl border bg-white p-6">
				<h2 className="text-xl font-semibold">AI Visibility by Model</h2>
				<p className="mt-2 text-sm text-slate-600">
					Discovery questions contain no restaurant name. Brand verification questions are counted separately. Unknown
					outcomes are excluded from each metric denominator.
				</p>
				<div className="mt-5 overflow-x-auto">
					<table className="w-full text-left text-sm">
						<thead>
							<tr className="border-b">
								<th className="p-2">Model / questions</th>
								<th className="p-2">Valid / planned</th>
								<th className="p-2">Mention</th>
								<th className="p-2">Recommendation</th>
								<th className="p-2">Correct location recommendation</th>
								<th className="p-2">Citations returned</th>
								<th className="p-2">Submitted website citations</th>
							</tr>
						</thead>
						<tbody>
							{report.groups.map((group) => (
								<tr key={`${group.targetId}-${group.questionType}`} className="border-b align-top">
									<th className="p-2 font-medium">
										{report.targets.find((target) => target.id === group.targetId)?.model ?? group.targetId}
										<span className="mt-1 block text-xs font-normal text-slate-500">
											{group.questionType === "discovery" ? "Discovery" : "Brand verification"}
										</span>
									</th>
									<td className="p-2">
										{group.valid}/{group.planned}
										<span className="block text-xs">
											{group.failed} failed · {group.missing} missing
										</span>
									</td>
									<td className="p-2">
										{metric(group.mention)}
										<span className="block text-xs">{group.mention.unknown} unknown</span>
									</td>
									<td className="p-2">
										{metric(group.recommendation)}
										<span className="block text-xs">{group.recommendation.unknown} unknown</span>
									</td>
									<td className="p-2">
										{metric(group.correctBranchRecommendation)}
										<span className="block text-xs">{group.correctBranchRecommendation.unknown} unknown</span>
									</td>
									<td className="p-2">
										{metric(group.citation)}
										<span className="block text-xs">{group.citationUnavailable} unavailable</span>
									</td>
									<td className="p-2">
										{metric(group.targetCitation)}
										<span className="block text-xs">{group.targetCitation.unknown} unknown</span>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>
			<section className="rounded-xl border bg-white p-6">
				<h2 className="text-xl font-semibold">Recommendations and Location Match</h2>
				<p className="mt-3 text-sm text-slate-600">
					A brand mention alone does not confirm a recommendation or a match to this location. Location judgments
					require distinguishing evidence in the answer.
				</p>
				<p className="mt-3 text-sm">
					Brand share of observed mentions:{" "}
					{report.brandShareOfVoice.rate === null
						? "Unavailable"
						: `${report.brandShareOfVoice.mentions}/${report.brandShareOfVoice.denominator} (${Math.round(report.brandShareOfVoice.rate * 100)}%)`}
					. This is limited to the sampled discovery answers.
				</p>
			</section>
			<section className="rounded-xl border bg-white p-6">
				<h2 className="text-xl font-semibold">Competitor Mentions</h2>
				{report.competitors.length ? (
					<ul className="mt-4 space-y-3">
						{report.competitors.map((competitor) => (
							<li key={competitor.name} className="flex justify-between gap-5 text-sm">
								<strong>{competitor.name}</strong>
								<span>
									{competitor.mentions} mentions ·{" "}
									{competitor.shareOfVoice === null
										? "Share unavailable"
										: `${Math.round(competitor.shareOfVoice * 100)}% observed share`}
								</span>
							</li>
						))}
					</ul>
				) : (
					<p className="mt-3 text-sm text-slate-600">
						No other restaurant mentions could be reliably identified in this batch.
					</p>
				)}
			</section>
			<section className="rounded-xl border bg-white p-6">
				<h2 className="text-xl font-semibold">Priority Actions</h2>
				<ol className="mt-4 space-y-5">
					{report.actions.map((action) => (
						<li key={action.id}>
							<span className="text-xs uppercase text-slate-500">{action.priority}</span>
							<h3 className="font-semibold">{action.title}</h3>
							<p className="mt-1 text-sm text-slate-600">{action.detail}</p>
							<p className="mt-1 text-xs text-slate-500">Evidence: {action.evidenceIds.join(", ") || "Unavailable"}</p>
						</li>
					))}
				</ol>
			</section>
			<section className="rounded-xl border bg-white p-6">
				<h2 className="text-xl font-semibold">Evidence and Methodology</h2>
				<p className="mt-3 text-sm text-slate-600">
					10 English questions × 2 model APIs × 1 response. Search was allowed; actual search execution and citation
					availability are recorded per response. The same frozen sample set is used for all calculations.
				</p>
				<ul className="mt-4 space-y-2 text-xs text-slate-600">
					{report.targets.map((target) => (
						<li key={target.id}>
							{target.provider} / {target.model}
							{target.searchEngine
								? ` / ${target.searchEngine} search (up to ${target.maxResults} results)`
								: " / native web search"}
						</li>
					))}
				</ul>
				<div className="mt-5 space-y-3">
					{report.samples.map((sample) => {
						const slot = sample.sampleId.split(":");
						const question = report.questions.find((item) => item.id === slot[0] || item.id === slot[1]);
						return (
							<details key={sample.sampleId} className="rounded-md border p-4">
								<summary className="cursor-pointer text-sm font-medium">
									{question?.text ?? sample.sampleId} · {sample.status}
								</summary>
								<div className="mt-4 space-y-3 text-sm">
									<p className="text-xs text-slate-500">Sample: {sample.sampleId}</p>
									{sample.error && <p>{sample.error}</p>}
									{sample.answer && (
										<>
											<p className="text-xs">
												{sample.answer.provider} / {sample.answer.returnedModel ?? sample.answer.requestedModel} ·
												Search: {sample.answer.searchExecution} · Citations: {sample.answer.citationAvailability} ·
												Answer quality: {sample.answer.quality}
											</p>
											<pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-4 font-sans">
												{sample.answer.text}
											</pre>
											<ul className="space-y-1">
												{sample.answer.citations.map((citation) => (
													<li key={`${citation.url}-${citation.citedText ?? ""}`}>
														<a
															href={safeLink(citation.url)}
															target="_blank"
															rel="noopener noreferrer"
															className="break-all underline"
														>
															{citation.title ?? citation.url}
														</a>
													</li>
												))}
											</ul>
										</>
									)}
									{sample.judgment && (
										<>
											<p>
												Mention: {sample.judgment.mention} · Recommendation: {sample.judgment.recommendation} ·
												Location: {sample.judgment.branch} · Rank: {sample.judgment.rank ?? "Unknown"}
											</p>
											{sample.judgment.quote && (
												<blockquote className="border-l-2 pl-4">{sample.judgment.quote}</blockquote>
											)}
											<p className="text-slate-600">{sample.judgment.note}</p>
										</>
									)}
								</div>
							</details>
						);
					})}
				</div>
				<p className="mt-4 break-all text-xs text-slate-500">
					Plan SHA-256: {report.planHash}
					<br />
					Report SHA-256: {report.hash}
				</p>
			</section>
			<section className="rounded-xl border bg-white p-6">
				<h2 className="text-xl font-semibold">Missing Data and Limitations</h2>
				<ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-600">
					{report.limitations.map((limitation) => (
						<li key={limitation}>{limitation}</li>
					))}
				</ul>
			</section>
		</article>
	);
}
