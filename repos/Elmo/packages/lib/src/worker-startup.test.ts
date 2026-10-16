import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const startup = vi.hoisted(() => ({
	reportGeneration: true,
	assertRequiredEnv: vi.fn(),
	validateScrapeTargets: vi.fn(),
	startCredentialRefresh: vi.fn(),
	registerPublicAudits: vi.fn(),
	registerRestaurantGeo: vi.fn(),
	boss: {
		on: vi.fn(),
		start: vi.fn(),
		stop: vi.fn(),
		createQueue: vi.fn(),
		schedule: vi.fn(),
		work: vi.fn(),
	},
}));

vi.mock("@sentry/node", () => ({
	init: vi.fn(),
	captureException: vi.fn(),
	flush: vi.fn(),
	withScope: vi.fn(),
}));
vi.mock("@workspace/config/env", () => ({ assertRequiredEnv: startup.assertRequiredEnv }));
vi.mock("@workspace/config/scrape-targets", () => ({ parseScrapeTargets: () => ["stub:stub"] }));
vi.mock("../../deployment/src/index", () => ({
	getDeploymentFeatures: () => ({ reportGeneration: startup.reportGeneration }),
}));
vi.mock("../../deployment/src/email", () => ({ sendEmail: vi.fn() }));
vi.mock("@workspace/lib/providers", () => ({
	getProvider: vi.fn(),
	validateScrapeTargets: startup.validateScrapeTargets,
}));
vi.mock("@workspace/lib/secrets", () => ({ startCredentialRefresh: startup.startCredentialRefresh }));
vi.mock("../../../apps/worker/src/boss", () => ({ getBoss: () => startup.boss }));
vi.mock("../../../apps/worker/src/telemetry", () => ({ shutdownTelemetry: vi.fn() }));
vi.mock("../../../apps/worker/src/jobs/public-audits", () => ({ registerPublicAudits: startup.registerPublicAudits }));
vi.mock("../../../apps/worker/src/jobs/restaurant-geo", () => ({
	registerRestaurantGeo: startup.registerRestaurantGeo,
}));
vi.mock("../../../apps/worker/src/jobs/process-prompt", () => ({ processPromptJob: vi.fn() }));
vi.mock("../../../apps/worker/src/jobs/generate-report", () => ({ generateReportJob: vi.fn() }));
vi.mock("../../../apps/worker/src/jobs/analyze-brand", () => ({ analyzeBrandJob: vi.fn() }));
vi.mock("../../../apps/worker/src/jobs/schedule-maintenance", () => ({ scheduleMaintenanceJob: vi.fn() }));
vi.mock("../../../apps/worker/src/jobs/sync-auth0-memberships", () => ({ syncAuth0MembershipsJob: vi.fn() }));

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
	startup.reportGeneration = true;
	vi.stubEnv("SENTRY_DSN", "");
	vi.stubEnv("DEPLOYMENT_MODE", "local");
	vi.stubEnv("DATABASE_URL", "postgres://unused/worker_startup_test");
	vi.stubEnv("PUBLIC_AUDIT_WORKER_ONLY", "");
	vi.stubEnv("PUBLIC_AUDIT_ENABLED", "");
	vi.stubEnv("GEO_PIPELINE_ENABLED", "1");
	vi.spyOn(process, "on").mockReturnValue(process);
	vi.spyOn(process, "exit").mockImplementation(() => {
		throw new Error("Worker startup unexpectedly failed");
	});
	vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
});

async function startWorker(auditOnly = false) {
	const entrypoint = fileURLToPath(new URL("../../../apps/worker/src/index.ts", import.meta.url));
	await import(entrypoint);
	await vi.waitFor(() => {
		expect(console.log).toHaveBeenCalledWith(
			auditOnly
				? "Public audit worker ready; legacy paid model queues are not registered"
				: "All handlers registered, worker is ready",
		);
	});
	expect(process.exit).not.toHaveBeenCalled();
}

function expectLegacyJobs() {
	expect(startup.assertRequiredEnv).toHaveBeenCalledOnce();
	expect(startup.validateScrapeTargets).toHaveBeenCalledOnce();
	expect(startup.boss.start).toHaveBeenCalledOnce();
	for (const queue of ["process-prompt", "generate-report", "analyze-brand", "schedule-maintenance"]) {
		expect(startup.boss.createQueue).toHaveBeenCalledWith(queue, expect.any(Object));
		expect(startup.boss.work).toHaveBeenCalledWith(queue, expect.any(Object), expect.any(Function));
	}
	expect(startup.boss.schedule).toHaveBeenCalledWith(
		"schedule-maintenance",
		"*/5 * * * *",
		{ source: "scheduled" },
		{ tz: "UTC" },
	);
	expect(startup.registerRestaurantGeo).toHaveBeenCalledWith(startup.boss);
}

describe("worker deployment compatibility", () => {
	it("keeps scheduled legacy processing when no public audit flags are configured", async () => {
		await startWorker();
		expectLegacyJobs();
		expect(startup.registerPublicAudits).not.toHaveBeenCalled();
	});

	it("keeps scheduled legacy processing when public audits are explicitly disabled", async () => {
		vi.stubEnv("PUBLIC_AUDIT_ENABLED", "0");
		vi.stubEnv("PUBLIC_AUDIT_WORKER_ONLY", "0");
		await startWorker();
		expectLegacyJobs();
		expect(startup.registerPublicAudits).not.toHaveBeenCalled();
	});

	it("adds audit processing alongside existing queues when enabled on the normal worker", async () => {
		vi.stubEnv("PUBLIC_AUDIT_ENABLED", "1");
		await startWorker();
		expectLegacyJobs();
		expect(startup.registerPublicAudits).toHaveBeenCalledWith(startup.boss, expect.any(Function));
	});

	it("retains the deployment feature restriction on legacy report generation", async () => {
		startup.reportGeneration = false;
		vi.stubEnv("PUBLIC_AUDIT_ENABLED", "1");
		await startWorker();
		expect(startup.boss.createQueue.mock.calls.map(([name]) => name)).not.toContain("generate-report");
		expect(startup.boss.work.mock.calls.map(([name]) => name)).not.toContain("generate-report");
		for (const queue of ["process-prompt", "analyze-brand", "schedule-maintenance"]) {
			expect(startup.boss.work).toHaveBeenCalledWith(queue, expect.any(Object), expect.any(Function));
		}
		expect(startup.registerPublicAudits).toHaveBeenCalledWith(startup.boss, expect.any(Function));
	});

	it("isolates the dedicated audit worker without enabling legacy paid queues", async () => {
		vi.stubEnv("PUBLIC_AUDIT_WORKER_ONLY", "1");
		await startWorker(true);
		expect(startup.boss.start).toHaveBeenCalledOnce();
		expect(startup.startCredentialRefresh).toHaveBeenCalledOnce();
		expect(startup.registerPublicAudits).toHaveBeenCalledWith(startup.boss, expect.any(Function));
		expect(startup.boss.createQueue).not.toHaveBeenCalled();
		expect(startup.boss.work).not.toHaveBeenCalled();
		expect(startup.boss.schedule).not.toHaveBeenCalled();
		expect(startup.registerRestaurantGeo).not.toHaveBeenCalled();
		expect(startup.assertRequiredEnv).not.toHaveBeenCalled();
		expect(startup.validateScrapeTargets).not.toHaveBeenCalled();
	});

	it("preserves Auth0 membership sync in a normal whitelabel deployment", async () => {
		vi.stubEnv("DEPLOYMENT_MODE", "whitelabel");
		await startWorker();
		expectLegacyJobs();
		expect(startup.boss.createQueue).toHaveBeenCalledWith("sync-auth0-memberships", expect.any(Object));
		expect(startup.boss.schedule).toHaveBeenCalledWith(
			"sync-auth0-memberships",
			"*/15 * * * *",
			{ source: "scheduled" },
			{ tz: "UTC" },
		);
		expect(startup.boss.work).toHaveBeenCalledWith("sync-auth0-memberships", expect.any(Object), expect.any(Function));
	});
});
