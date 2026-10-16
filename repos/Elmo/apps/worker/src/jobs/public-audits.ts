import { type AuditRuntimeDependencies, executeAuditRuntimeTask } from "@workspace/lib/audits/runtime";
import { runPendingAuditTasks } from "@workspace/lib/audits/service";
import type { PgBoss } from "pg-boss";

/** Database leases and budget reservations, rather than queue retries, own paid work. */
export async function registerPublicAudits(boss: PgBoss, sendEmail?: AuditRuntimeDependencies["sendEmail"]) {
	await boss.createQueue("public-audit-dispatch", { retryLimit: 0, expireInSeconds: 1800 });
	await boss.schedule("public-audit-dispatch", "* * * * *", {}, { tz: "UTC" });
	await boss.work("public-audit-dispatch", { localConcurrency: 1 }, async () => {
		await runPendingAuditTasks((task) => executeAuditRuntimeTask(task, { sendEmail }));
	});
}
