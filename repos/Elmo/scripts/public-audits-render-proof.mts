import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { sql } from "../packages/lib/node_modules/drizzle-orm/index.js";
import { db } from "../packages/lib/src/db/db.ts";
import { rows } from "../packages/lib/src/audits/budget.ts";
import type { AuditReportSnapshot } from "../packages/lib/src/audits/contracts.ts";
import { renderAuditPdf } from "../packages/lib/src/audits/delivery.ts";
import { renderAuditReportHtml } from "../packages/lib/src/audits/report.ts";

const database = new URL(process.env.DATABASE_URL ?? "").pathname.slice(1);
if (!/^auditv1test_\d+$/.test(database) || process.env.NODE_ENV !== "test" || process.env.PUBLIC_AUDIT_LIVE_CALLS_ENABLED === "1") throw new Error("Use the isolated synthetic audit test environment");
const state = path.resolve("deploy/audits/.state");
try {
	const result = JSON.parse(await readFile(path.join(state, "integration-result.json"), "utf8"));
	const [report] = await rows<{ snapshot: AuditReportSnapshot }>(db, sql`select snapshot from audit_reports where audit_id=${result.reportId}::uuid order by version desc limit 1`);
	if (!report?.snapshot.limitations.some((limitation) => /synthetic/i.test(limitation))) throw new Error("This proof must retain the synthetic result label");
	await mkdir(state, { recursive: true });
	await writeFile(path.join(state, "report-proof.html"), renderAuditReportHtml(report.snapshot));
	const pdf = await renderAuditPdf(report.snapshot);
	await writeFile(path.join(state, "report-proof.pdf"), pdf);
	console.log(JSON.stringify({ synthetic: true, pdfBytes: pdf.length, output: path.join(state, "report-proof.pdf"), modelCalls: 0, emails: 0 }));
} finally {
	await db.$client.end();
}
