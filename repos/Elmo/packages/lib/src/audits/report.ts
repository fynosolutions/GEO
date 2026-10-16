import type {
	AuditGroupMetrics,
	AuditMetric,
	AuditPriorityAction,
	AuditReportSnapshot,
	AuditSampleResult,
	FrozenAuditPlan,
	RestaurantWebsiteResult,
} from "./contracts";
import { auditHash, freezeAuditValue } from "./plan";

type BuildReportInput = {
	auditId: string;
	version: number;
	createdAt: string;
	plan: FrozenAuditPlan;
	samples: AuditSampleResult[];
	website: RestaurantWebsiteResult;
};

function ratio(numerator: number, denominator: number, unknown: number): AuditMetric {
	return { numerator, denominator, rate: denominator ? numerator / denominator : null, unknown };
}

function complete(sample: AuditSampleResult): boolean {
	return sample.status === "succeeded" && sample.answer?.quality === "complete" && !!sample.answer.text.trim();
}

function safeReportValue<T>(value: T): T {
	if (value instanceof Date) return value.toISOString() as T;
	if (Array.isArray(value)) return value.map(safeReportValue) as T;
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value)
				.filter(([key]) => !["path", "sealed", "tokenHash", "token_hash", "ip_hash"].includes(key))
				.map(([key, item]) => [key, safeReportValue(item)]),
		) as T;
	}
	return value;
}

function citationHost(url: string): string | undefined {
	try {
		const parsed = new URL(url);
		if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) return undefined;
		return parsed.hostname
			.toLowerCase()
			.replace(/^www\./, "")
			.replace(/\.$/, "");
	} catch {
		return undefined;
	}
}

function targetCitationMetric(plan: FrozenAuditPlan, samples: AuditSampleResult[]): AuditMetric {
	const domain = citationHost(plan.subject.website);
	const values = samples.map((sample) => {
		if (
			!complete(sample) ||
			!sample.answer ||
			!["returned", "none_returned"].includes(sample.answer.citationAvailability)
		)
			return "unknown";
		const hosts = sample.answer.citations.map((citation) => citationHost(citation.url));
		if (domain && hosts.some((host) => host === domain || host?.endsWith(`.${domain}`))) return "yes";
		return hosts.some((host) => host === undefined) ? "unknown" : "no";
	});
	const known = values.filter((value) => value !== "unknown");
	return ratio(known.filter((value) => value === "yes").length, known.length, values.length - known.length);
}

function judgmentMetric(samples: AuditSampleResult[], key: "mention" | "recommendation"): AuditMetric {
	const known = samples.filter(
		(sample) => complete(sample) && sample.judgment?.[key] && sample.judgment[key] !== "unknown",
	);
	return ratio(
		known.filter((sample) => sample.judgment?.[key] === "yes").length,
		known.length,
		samples.length - known.length,
	);
}

function branchMetric(samples: AuditSampleResult[]): AuditMetric {
	const known = samples.filter(
		(sample) =>
			complete(sample) &&
			(sample.judgment?.recommendation === "no" ||
				(sample.judgment?.recommendation === "yes" && sample.judgment.branch !== "unknown")),
	);
	return ratio(
		known.filter((sample) => sample.judgment?.recommendation === "yes" && sample.judgment.branch === "matched").length,
		known.length,
		samples.length - known.length,
	);
}

function groupMetrics(plan: FrozenAuditPlan, samples: AuditSampleResult[]): AuditGroupMetrics[] {
	return plan.targets.flatMap((target) =>
		(["discovery", "brand_verification"] as const).map((questionType) => {
			const slots = plan.samples.filter(
				(slot) =>
					slot.targetId === target.id &&
					plan.questions.find((question) => question.id === slot.questionId)?.type === questionType,
			);
			const selected = slots
				.map((slot) => samples.find((sample) => sample.sampleId === slot.sampleId))
				.filter((sample): sample is AuditSampleResult => !!sample);
			const valid = selected.filter(complete);
			const citationKnown = valid.filter((sample) =>
				["returned", "none_returned"].includes(sample.answer?.citationAvailability ?? ""),
			);
			return {
				targetId: target.id,
				questionType,
				planned: slots.length,
				valid: valid.length,
				judged: valid.filter((sample) => !!sample.judgment).length,
				failed: selected.filter(
					(sample) =>
						["failed", "uncertain", "skipped"].includes(sample.status) ||
						(sample.status === "succeeded" && !complete(sample)),
				).length,
				missing: selected.filter((sample) => ["pending", "running"].includes(sample.status)).length,
				mention: judgmentMetric(selected, "mention"),
				recommendation: judgmentMetric(selected, "recommendation"),
				correctBranchRecommendation: branchMetric(selected),
				citation: ratio(
					citationKnown.filter(
						(sample) => sample.answer?.citationAvailability === "returned" && sample.answer.citations.length > 0,
					).length,
					citationKnown.length,
					slots.length - citationKnown.length,
				),
				citationUnavailable: valid.filter((sample) => sample.answer?.citationAvailability === "unavailable").length,
				targetCitation: targetCitationMetric(plan, selected),
			};
		}),
	);
}

function competitorMetrics(plan: FrozenAuditPlan, samples: AuditSampleResult[]) {
	const discoveryIds = new Set(
		plan.questions.filter((question) => question.type === "discovery").map((question) => question.id),
	);
	const discovery = samples.filter(
		(sample) =>
			complete(sample) &&
			plan.samples.some((slot) => slot.sampleId === sample.sampleId && discoveryIds.has(slot.questionId)),
	);
	const brands = new Map<string, { name: string; mentions: number; sampleIds: string[] }>();
	const targetNames = new Set(
		[plan.subject.name, ...plan.subject.aliases].map((name) => name.toLowerCase().replace(/[^a-z0-9]/g, "")),
	);
	let brandMentions = 0;
	for (const sample of discovery) {
		if (sample.judgment?.mention === "yes") brandMentions++;
		const seen = new Set<string>();
		for (const competitor of sample.judgment?.competitors ?? []) {
			const key = competitor.name.toLowerCase().replace(/[^a-z0-9]/g, "");
			if (seen.has(key) || targetNames.has(key)) continue;
			seen.add(key);
			const row = brands.get(key) ?? { name: competitor.name, mentions: 0, sampleIds: [] };
			row.mentions++;
			row.sampleIds.push(sample.sampleId);
			brands.set(key, row);
		}
	}
	const denominator = brandMentions + [...brands.values()].reduce((total, row) => total + row.mentions, 0);
	return {
		competitors: [...brands.values()]
			.sort((a, b) => b.mentions - a.mentions || a.name.localeCompare(b.name))
			.map((row) => ({ ...row, shareOfVoice: denominator ? row.mentions / denominator : null })),
		brandShareOfVoice: {
			brand: plan.subject.name,
			mentions: brandMentions,
			denominator,
			rate: denominator ? brandMentions / denominator : null,
		},
	};
}

function priorityActions(
	website: RestaurantWebsiteResult,
	groups: AuditGroupMetrics[],
	samples: AuditSampleResult[],
): AuditPriorityAction[] {
	const actions: AuditPriorityAction[] = (website.websiteAudit.findings ?? []).map((finding) => ({
		...finding,
		id: `website:${finding.id}`,
	}));
	for (const check of website.actionChecks.filter((check) => check.status === "missing")) {
		actions.push({
			id: `action:${check.id}`,
			priority: "medium",
			title: `Review the ${check.kind} entry point`,
			detail:
				"The checked website pages did not expose this action. Confirm the official destination and make it easy to find.",
			evidenceIds: check.evidenceIds.length ? check.evidenceIds : [check.id],
		});
	}
	const gaps = groups.filter(
		(group) =>
			group.questionType === "discovery" &&
			group.mention.denominator > 0 &&
			group.mention.numerator < group.mention.denominator,
	);
	if (gaps.length)
		actions.push({
			id: "visibility:discovery",
			priority: "medium",
			title: "Review content for the tested dining needs",
			detail:
				"Some judged discovery answers did not mention this restaurant. Review the corresponding questions and publish accurate, useful information about the dining needs the restaurant actually serves. This observation does not establish a cause.",
			evidenceIds: samples.filter((sample) => sample.judgment?.mention === "no").map((sample) => sample.sampleId),
		});
	const wrongBranch = samples.filter((sample) => sample.judgment?.branch === "wrong_branch");
	if (wrongBranch.length)
		actions.push({
			id: "identity:branch",
			priority: "high",
			title: "Review location-specific identity information",
			detail:
				"Some excerpts identify a different location. Check the cited evidence and ensure the official location page clearly states the street address and current contact details.",
			evidenceIds: wrongBranch.map((sample) => sample.sampleId),
		});
	return actions.sort(
		(a, b) =>
			({ high: 0, medium: 1, low: 2 })[a.priority] - { high: 0, medium: 1, low: 2 }[b.priority] ||
			a.id.localeCompare(b.id),
	);
}

function normalizeSamples(plan: FrozenAuditPlan, input: AuditSampleResult[]): AuditSampleResult[] {
	const ids = new Set(plan.samples.map((slot) => slot.sampleId));
	if (input.some((sample) => !ids.has(sample.sampleId)))
		throw new Error("Report samples must belong to the frozen plan");
	if (new Set(input.map((sample) => sample.sampleId)).size !== input.length)
		throw new Error("Duplicate samples cannot alter report denominators");
	return plan.samples.map((slot) =>
		safeReportValue(
			input.find((sample) => sample.sampleId === slot.sampleId) ?? {
				sampleId: slot.sampleId,
				status: "pending" as const,
			},
		),
	);
}

export function buildAuditReport({
	auditId,
	version,
	createdAt,
	plan,
	samples: input,
	website: websiteInput,
}: BuildReportInput): AuditReportSnapshot {
	const website = safeReportValue(websiteInput);
	const samples = normalizeSamples(plan, input);
	const synthetic = samples.some((sample) => sample.answer?.provider === "stub");
	const groups = groupMetrics(plan, samples);
	const counts = {
		planned: plan.samples.length,
		valid: samples.filter(complete).length,
		judged: samples.filter((sample) => complete(sample) && !!sample.judgment).length,
		failed: groups.reduce((total, group) => total + group.failed, 0),
		missing: groups.reduce((total, group) => total + group.missing, 0),
	};
	const websiteComplete = [website.pageFetch, website.businessExtraction, website.websiteAudit].every(
		(stage) => stage.status === "succeeded",
	);
	const status = !counts.valid
		? ("failed" as const)
		: counts.valid === counts.planned && counts.judged === counts.planned && websiteComplete
			? ("completed" as const)
			: ("partial" as const);
	const score = website.websiteAudit.score;
	const payload = {
		schemaVersion: "restaurant-audit.report.v1" as const,
		auditId,
		version,
		createdAt,
		planHash: plan.hash,
		subject: structuredClone(plan.subject),
		status,
		synthetic,
		counts,
		website: structuredClone(website),
		websiteTechnicalScore:
			website.websiteAudit.status === "succeeded" &&
			typeof score === "number" &&
			Number.isFinite(score) &&
			score >= 0 &&
			score <= 100
				? score
				: null,
		targets: structuredClone(plan.targets),
		questions: structuredClone(plan.questions),
		groups,
		...competitorMetrics(plan, samples),
		actions: priorityActions(website, groups, samples),
		samples,
		limitations: [
			...(synthetic
				? [
						"SYNTHETIC TEST REPORT: Some answers were generated by the stub provider. This is not a real restaurant visibility measurement and must not be presented as live evidence.",
					]
				: []),
			"This report is one English-language API sample per question and model; it does not measure consumer ChatGPT or Gemini website results, repeatability, or search demand.",
			"Discovery and brand-verification results are separate. Each metric shows its own known-answer denominator; missing and unknown answers are never treated as a negative outcome.",
			"Email verification establishes mailbox access, not ownership of the restaurant website. The location identity was asserted by the requester.",
			"Correct-location recommendation uses known negative recommendations and recommendations with known branch identity as its denominator. Brand-only recommendations have unknown branch identity.",
			"Competitor share of voice counts each observed brand at most once per discovery answer, within this fixed sample only; it is not market share.",
			"Permission to search is distinct from observed search execution. Citation availability depends on the provider interface.",
			"Any-source citation coverage and submitted-website domain citation coverage are separate. A domain match includes its subdomains and does not establish website ownership, citation accuracy, or the correct restaurant branch.",
			"Website technical readiness is a separate diagnostic. No causal relationship between a technical finding and AI recommendations has been established.",
			...(status !== "completed"
				? [
						"This report has missing or incomplete stages. Review the coverage and individual sample statuses before interpreting rates.",
					]
				: []),
		],
	};
	return freezeAuditValue({ ...payload, hash: auditHash(payload) });
}

export function escapeAuditHtml(value: unknown): string {
	return String(value ?? "").replace(
		/[&<>"']/g,
		(character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character,
	);
}

function metricText(metric: AuditMetric): string {
	return metric.rate === null
		? `Unavailable (0 known; ${metric.unknown} unknown)`
		: `${Math.round(metric.rate * 100)}% (${metric.numerator}/${metric.denominator}; ${metric.unknown} unknown)`;
}

function renderMetrics(report: AuditReportSnapshot, branch: boolean): string {
	return `<table><thead><tr><th>Model target / question group</th><th>Coverage</th><th>${branch ? "Recommended" : "Mentioned"}</th><th>${branch ? "Correct-location recommendation" : "Any-source / submitted-domain citations"}</th></tr></thead><tbody>${report.groups.map((group) => `<tr><td>${escapeAuditHtml(group.targetId)} / ${group.questionType === "discovery" ? "Discovery" : "Brand verification"}</td><td>${group.valid}/${group.planned} valid; ${group.judged} judged; ${group.failed} failed; ${group.missing} missing</td><td>${escapeAuditHtml(metricText(branch ? group.recommendation : group.mention))}</td><td>${escapeAuditHtml(metricText(branch ? group.correctBranchRecommendation : group.citation))}${!branch ? `<br>Submitted domain: ${escapeAuditHtml(metricText(group.targetCitation))}` : ""}${!branch && group.citationUnavailable ? `; ${group.citationUnavailable} interface unavailable` : ""}</td></tr>`).join("")}</tbody></table>`;
}

function renderEvidence(sample: AuditSampleResult): string {
	const answer = sample.answer;
	return `<article><h3>${escapeAuditHtml(sample.sampleId)} — ${escapeAuditHtml(sample.status)}</h3>${answer ? `<p>API: ${escapeAuditHtml(answer.provider)}; requested: ${escapeAuditHtml(answer.requestedModel)}; returned: ${escapeAuditHtml(answer.returnedModel ?? "unavailable")}; search: ${escapeAuditHtml(answer.searchExecution)}; citations: ${escapeAuditHtml(answer.citationAvailability)}; quality: ${escapeAuditHtml(answer.quality)}</p><pre>${escapeAuditHtml(answer.text)}</pre><p>Citation URLs: ${answer.citations.length ? answer.citations.map((citation) => escapeAuditHtml(citation.url)).join("; ") : "None returned / unavailable (see status)"}</p>` : "<p>No answer available.</p>"}${sample.judgment ? `<p>Judgment: mention ${sample.judgment.mention}; recommendation ${sample.judgment.recommendation}; branch ${sample.judgment.branch}; rank ${sample.judgment.rank ?? "unknown"}</p><blockquote>${escapeAuditHtml(sample.judgment.quote)}</blockquote><p>${escapeAuditHtml(sample.judgment.note)}</p>` : "<p>Judgment unavailable.</p>"}${sample.error ? `<p>${escapeAuditHtml(sample.error)}</p>` : ""}</article>`;
}

export function renderAuditReportHtml(report: AuditReportSnapshot): string {
	const htmlEscape = escapeAuditHtml;
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlEscape(report.subject.name)} — Restaurant AI Visibility Report</title><style>body{font-family:Arial,sans-serif;color:#162a3a;max-width:1080px;margin:36px auto;padding:0 24px;line-height:1.5}h1,h2{color:#123e58}h2{margin-top:32px;border-bottom:2px solid #c9dde9;padding-bottom:8px}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #cedbe2;padding:9px;text-align:left;vertical-align:top}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;background:#f1f5f8;padding:16px}blockquote{border-left:3px solid #4b7890;padding-left:12px}article{break-inside:avoid;border-bottom:1px solid #ddd;padding-bottom:18px}small{color:#536775}@media print{body{margin:0;padding:0;max-width:none}h2{break-after:avoid}thead{display:table-header-group}article{break-inside:auto}}</style></head><body>
<h1>${report.synthetic ? "Synthetic Test Report — " : ""}Restaurant AI Visibility Report</h1><p>${htmlEscape(report.subject.name)} · ${htmlEscape(report.createdAt)} · Version ${report.version} · ${htmlEscape(report.status)}</p>
<h2>1. Restaurant and Location</h2><p>${htmlEscape(report.subject.name)}<br>${htmlEscape(report.subject.address)}, ${htmlEscape(report.subject.city)}, ${htmlEscape(report.subject.state)} ${htmlEscape(report.subject.postalCode ?? "")}<br>${htmlEscape(report.subject.website)}<br>Cuisine: ${htmlEscape(report.subject.cuisine ?? "Not supplied")}<br>Identity provenance: ${htmlEscape(report.subject.provenance)}</p>
<h2>2. Executive Summary</h2><p>${report.counts.valid} of ${report.counts.planned} planned answers are complete; ${report.counts.judged} have a judgment, ${report.counts.failed} failed or incomplete, and ${report.counts.missing} remain missing. This is an API visibility snapshot for one location.</p>
<h2>3. Website Technical Readiness</h2><p>Technical score: ${report.websiteTechnicalScore === null ? "Unavailable" : `${report.websiteTechnicalScore}/100`}. Page fetch: ${htmlEscape(report.website.pageFetch.status)}. Business extraction: ${htmlEscape(report.website.businessExtraction.status)}. Technical audit: ${htmlEscape(report.website.websiteAudit.status)}.</p><ul>${(report.website.websiteAudit.findings ?? []).map((finding) => `<li>${htmlEscape(finding.title)}: ${htmlEscape(finding.detail)} (evidence: ${htmlEscape(finding.evidenceIds.join(", "))})</li>`).join("")}</ul>
<h2>4. AI Visibility by Model</h2>${renderMetrics(report, false)}<p>${report.targets.map((target) => `${htmlEscape(target.id)}: ${htmlEscape(target.model)}${target.searchEngine ? ` + ${htmlEscape(target.searchEngine)} (up to ${target.maxResults} results)` : "; search enabled, execution recorded per answer"}`).join("<br>")}</p>
<h2>5. Recommendations and Location Match</h2>${renderMetrics(report, true)}<p>Recommendation and branch identity are separate judgments. Brand verification is factual checking, not a discovery recommendation-rate benchmark.</p>
<h2>6. Competitor Mentions</h2><p>${htmlEscape(report.brandShareOfVoice.brand)}: ${report.brandShareOfVoice.mentions} observed mentions out of ${report.brandShareOfVoice.denominator} observed brand-answer pairs; sample share of voice ${report.brandShareOfVoice.rate === null ? "unavailable" : `${Math.round(report.brandShareOfVoice.rate * 100)}%`}.</p><ul>${report.competitors.map((competitor) => `<li>${htmlEscape(competitor.name)}: ${competitor.mentions} mentions; ${competitor.shareOfVoice === null ? "unavailable" : `${Math.round(competitor.shareOfVoice * 100)}%`} sample share of voice (evidence: ${htmlEscape(competitor.sampleIds.join(", "))})</li>`).join("")}</ul>
<h2>7. Priority Actions</h2>${report.actions.length ? `<ol>${report.actions.map((action) => `<li><strong>${htmlEscape(action.priority)}: ${htmlEscape(action.title)}</strong><p>${htmlEscape(action.detail)} Evidence: ${htmlEscape(action.evidenceIds.join(", "))}.</p></li>`).join("")}</ol>` : "<p>No evidence-backed priority action was generated from the available checks.</p>"}
<h2>8. Evidence and Methodology</h2><p>Frozen plan SHA-256: ${htmlEscape(report.planHash)}. Report SHA-256: ${htmlEscape(report.hash)}. Ten English questions, two API targets, one sample per question and target. Eight discovery questions and two brand-verification questions.</p><ol>${report.questions.map((question) => `<li>${htmlEscape(question.id)} (${htmlEscape(question.type)}): ${htmlEscape(question.text)}</li>`).join("")}</ol>${report.samples.map(renderEvidence).join("")}
<h2>9. Missing Data and Limitations</h2><ul>${report.limitations.map((limitation) => `<li>${htmlEscape(limitation)}</li>`).join("")}</ul><p>Website fetch issue: ${htmlEscape(report.website.pageFetch.error ?? "None recorded")}. Extraction issue: ${htmlEscape(report.website.businessExtraction.error ?? "None recorded")}. Technical audit issue: ${htmlEscape(report.website.websiteAudit.error ?? "None recorded")}.</p><small>English restaurant report · One location · API evidence only</small></body></html>`;
}
