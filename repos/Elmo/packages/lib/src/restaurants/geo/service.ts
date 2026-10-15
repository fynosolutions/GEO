import { and, desc, eq } from "drizzle-orm";
import type { z } from "zod";
import { db } from "../../db/db";
import type { DbConnection } from "../../db/db-connection";
import { brands, restaurantFactVersions, restaurantGeoRecords, restaurantStores } from "../../db/schema";
import { authorizeRestaurantScope } from "../service";
import { type Audit, compareSnapshot, sha256, stableJson } from "./compare";
import {
	type auditInput,
	bankSchema,
	type batchImportInput,
	type collectInput,
	type correctionInput,
	type importSnapshotInput,
	type judgmentInput,
	type publicationInput,
	type recordInput,
	type Scope,
	type scheduleInput,
	snapshotSchema,
	type verifyInput,
} from "./contracts";
import easyjoyBank from "./easyjoy-bank.json";
import { type Judgment, summarizeBatch, validateJudgment } from "./judgment";
import { type PilotBatch, readPilotBatch } from "./p0-import";
import { assertHtmlSource, isPlatformChannel } from "./platform-contracts";
import { p0RunsRoot } from "./runtime";

type RecordRow = typeof restaurantGeoRecords.$inferSelect;
async function append(
	conn: DbConnection,
	actor: string,
	storeId: string,
	kind: string,
	key: string,
	payload: Record<string, unknown>,
) {
	const hash = sha256(stableJson(payload));
	const [inserted] = await conn
		.insert(restaurantGeoRecords)
		.values({ storeId, kind, key, payload, sha256: hash, createdBy: actor })
		.onConflictDoNothing()
		.returning();
	if (inserted) return inserted;
	const [existing] = await conn
		.select()
		.from(restaurantGeoRecords)
		.where(
			and(
				eq(restaurantGeoRecords.storeId, storeId),
				eq(restaurantGeoRecords.kind, kind),
				eq(restaurantGeoRecords.key, key),
			),
		);
	if (!existing || existing.sha256 !== hash)
		throw new Error("该记录标识已存在且内容不同，请创建新记录；原始证据不会被覆盖");
	return existing;
}
async function record(conn: DbConnection, storeId: string, id: string, kind?: string) {
	const [row] = await conn
		.select()
		.from(restaurantGeoRecords)
		.where(and(eq(restaurantGeoRecords.id, id), eq(restaurantGeoRecords.storeId, storeId)));
	if (!row || (kind && row.kind !== kind)) throw new Error("记录不存在、类型不符或属于其他门店");
	if (sha256(stableJson(row.payload)) !== row.sha256) throw new Error("记录校验失败");
	return row;
}
export async function listGeoRecords(actor: string, scope: Scope) {
	await authorizeRestaurantScope(db, actor, scope);
	const rows = await db
		.select({
			id: restaurantGeoRecords.id,
			kind: restaurantGeoRecords.kind,
			key: restaurantGeoRecords.key,
			createdAt: restaurantGeoRecords.createdAt,
			sha256: restaurantGeoRecords.sha256,
		})
		.from(restaurantGeoRecords)
		.where(eq(restaurantGeoRecords.storeId, scope.storeId))
		.orderBy(desc(restaurantGeoRecords.createdAt))
		.limit(501);
	return { records: rows.slice(0, 500), truncated: rows.length > 500 };
}
export async function getGeoRecord(actor: string, input: z.infer<typeof recordInput>) {
	await authorizeRestaurantScope(db, actor, input);
	return record(db, input.storeId, input.recordId);
}
export async function installPilotBank(actor: string, scope: Scope) {
	return db.transaction(async (tx) => {
		await authorizeRestaurantScope(tx, actor, scope, true);
		const bank = bankSchema.parse(easyjoyBank);
		return append(tx, actor, scope.storeId, "question_bank", bank.id, bank);
	});
}
export async function importManualSnapshot(actor: string, input: z.infer<typeof importSnapshotInput>) {
	assertHtmlSource(input.snapshot.channel, input.snapshot.url);
	return db.transaction(async (tx) => {
		await authorizeRestaurantScope(tx, actor, input, true);
		const snapshot = snapshotSchema.parse(input.snapshot);
		if (snapshot.storeId !== input.storeId || snapshot.method !== "manual")
			throw new Error("人工导入必须属于当前门店并标记 manual，不能冒充自动采集");
		if (snapshot.evidence.some((e) => sha256(e.text) !== e.sha256)) throw new Error("快照证据指纹不匹配");
		return append(tx, actor, input.storeId, "snapshot", snapshot.id, snapshot);
	});
}
export async function requestCollection(actor: string, input: z.infer<typeof collectInput>) {
	assertHtmlSource(input.channel, input.url);
	return db.transaction(async (tx) => {
		await authorizeRestaurantScope(tx, actor, input, true);
		return append(tx, actor, input.storeId, "job_request", crypto.randomUUID(), {
			...input,
			operation: "collect",
			requestedAt: new Date().toISOString(),
		});
	});
}
export async function auditChannel(actor: string, input: z.infer<typeof auditInput>) {
	return db.transaction(async (tx) => {
		await authorizeRestaurantScope(tx, actor, input, true);
		const source = await record(tx, input.storeId, input.recordId, "snapshot");
		const snapshot = snapshotSchema.parse(source.payload);
		if (isPlatformChannel(snapshot.channel)) throw new Error("平台快照暂不用于自动诊断");
		const [version] = await tx
			.select()
			.from(restaurantFactVersions)
			.where(
				and(eq(restaurantFactVersions.storeId, input.storeId), eq(restaurantFactVersions.version, input.factVersion)),
			);
		if (!version) throw new Error("请先在 P1 确认该门店事实版本");
		const audit = compareSnapshot({
			storeId: input.storeId,
			factVersion: version.version,
			facts: version.facts,
			snapshot,
		});
		return append(tx, actor, input.storeId, "audit", crypto.randomUUID(), {
			...audit,
			snapshotRecordId: source.id,
			factVersionSha256: version.sha256,
		});
	});
}
export async function draftCorrection(actor: string, input: z.infer<typeof correctionInput>) {
	return db.transaction(async (tx) => {
		await authorizeRestaurantScope(tx, actor, input, true);
		const row = await record(tx, input.storeId, input.recordId, "audit");
		const audit = row.payload as unknown as Audit;
		const finding = audit.findings.find((f) => f.id === input.findingId);
		if (!finding || !["mismatch", "missing"].includes(finding.status))
			throw new Error("只能针对有证据的差异生成修改稿");
		if (audit.identityStatus !== "matched") throw new Error("分店身份尚未匹配，请先核实名称与地址并重新采集");
		return append(tx, actor, input.storeId, "correction", crypto.randomUUID(), {
			auditId: row.id,
			finding,
			factVersion: audit.factVersion,
			snapshotRecordId: row.payload.snapshotRecordId,
			status: "draft",
			text: `请核实后将 ${finding.field} 更新为：${JSON.stringify(finding.expected)}。`,
			requiresManualPublication: true,
		});
	});
}
export async function recordPublication(actor: string, input: z.infer<typeof publicationInput>) {
	return db.transaction(async (tx) => {
		const store = await authorizeRestaurantScope(tx, actor, input, true);
		const draft = await record(tx, input.storeId, input.recordId, "correction");
		if (draft.payload.factVersion !== store.currentVersion)
			throw new Error("事实版本已更新，请基于最新版本重新生成修改稿");
		if (Date.parse(input.publishedAt) > Date.now() || Date.parse(input.publishedAt) < draft.createdAt.getTime())
			throw new Error("发布时间必须在草稿创建后且不晚于当前时间");
		return append(tx, actor, input.storeId, "publication", draft.id, {
			correctionId: draft.id,
			publishedUrl: input.publishedUrl,
			publishedAt: input.publishedAt,
			note: input.note,
			status: "human_reported_published",
			verification: "pending",
			factVersion: draft.payload.factVersion,
		});
	});
}
export async function verifyPublication(actor: string, input: z.infer<typeof verifyInput>) {
	return db.transaction(async (tx) => {
		const store = await authorizeRestaurantScope(tx, actor, input, true);
		const publication = await record(tx, input.storeId, input.recordId, "publication");
		const correction = await record(tx, input.storeId, String(publication.payload.correctionId), "correction");
		const original = snapshotSchema.parse(
			(await record(tx, input.storeId, String(correction.payload.snapshotRecordId), "snapshot")).payload,
		);
		const snapshot = snapshotSchema.parse((await record(tx, input.storeId, input.snapshotId, "snapshot")).payload);
		if (snapshot.channel !== original.channel || snapshot.listingId !== original.listingId)
			throw new Error("验证必须重采同一渠道的同一条门店记录");
		if (Date.parse(snapshot.collectedAt) <= Date.parse(String(publication.payload.publishedAt)))
			throw new Error("验证快照必须采集于发布之后");
		if (store.currentVersion !== publication.payload.factVersion) throw new Error("事实版本已变化，需重新诊断");
		const [version] = await tx
			.select()
			.from(restaurantFactVersions)
			.where(
				and(
					eq(restaurantFactVersions.storeId, input.storeId),
					eq(restaurantFactVersions.version, store.currentVersion),
				),
			);
		if (!version) throw new Error("事实版本不存在");
		const audit = compareSnapshot({
			storeId: input.storeId,
			factVersion: version.version,
			facts: version.facts,
			snapshot,
		});
		const field = (correction.payload.finding as { field: string }).field;
		const finding = audit.findings.find((f) => f.field === field);
		return append(tx, actor, input.storeId, "verification", crypto.randomUUID(), {
			publicationId: publication.id,
			snapshotRecordId: input.snapshotId,
			factVersion: version.version,
			status: audit.identityStatus === "matched" && finding?.status === "consistent" ? "verified" : "not_verified",
			finding,
			aiRetest: "pending",
		});
	});
}

export async function saveCollectorResult(
	actor: string,
	scope: Scope,
	requestId: string,
	snapshot: unknown,
	websiteAudit?: Record<string, unknown>,
) {
	return db.transaction(async (tx) => {
		await authorizeRestaurantScope(tx, actor, scope, true);
		const request = await record(tx, scope.storeId, requestId, "job_request");
		const [done] = await tx
			.select()
			.from(restaurantGeoRecords)
			.where(
				and(
					eq(restaurantGeoRecords.storeId, scope.storeId),
					eq(restaurantGeoRecords.kind, "job_result"),
					eq(restaurantGeoRecords.key, requestId),
				),
			);
		if (done) return done;
		const parsed = snapshotSchema.parse(snapshot);
		assertHtmlSource(parsed.channel, parsed.url);
		if (
			parsed.storeId !== scope.storeId ||
			parsed.method !== "automatic" ||
			parsed.url !== request.payload.url ||
			parsed.channel !== request.payload.channel ||
			parsed.listingId !== request.payload.listingId
		)
			throw new Error("采集结果与原始任务不匹配");
		if (parsed.evidence.some((e) => sha256(e.text) !== e.sha256)) throw new Error("采集证据校验失败");
		const result = await append(tx, actor, scope.storeId, "snapshot", requestId, parsed);
		if (websiteAudit) await append(tx, actor, scope.storeId, "website_audit", requestId, websiteAudit);
		await append(tx, actor, scope.storeId, "job_result", requestId, {
			requestId,
			snapshotRecordId: result.id,
			status: parsed.status,
			externalServiceUsd: 0,
		});
		return result;
	});
}

export async function importPilotBatch(actor: string, input: z.infer<typeof batchImportInput>) {
	await authorizeRestaurantScope(db, actor, input, true);
	const bank = bankSchema.parse(easyjoyBank);
	const batch = await readPilotBatch(p0RunsRoot(), input.batchId, bank);
	return db.transaction(async (tx) => {
		await authorizeRestaurantScope(tx, actor, input, true);
		return append(tx, actor, input.storeId, "batch_result", crypto.randomUUID(), batch);
	});
}
export async function reviewPilotAnswer(actor: string, input: z.infer<typeof judgmentInput>) {
	return db.transaction(async (tx) => {
		const store = await authorizeRestaurantScope(tx, actor, input, true);
		if (!store.currentVersion) throw new Error("先确认门店事实版本，才能判断是否正确分店");
		const batch = await record(tx, input.storeId, input.recordId, "batch_result");
		const judgment = validateJudgment(batch.payload as unknown as PilotBatch, input.judgment);
		return append(tx, actor, input.storeId, "judgment", crypto.randomUUID(), {
			batchRecordId: batch.id,
			factVersion: store.currentVersion,
			...judgment,
			reviewedBy: actor,
		});
	});
}
export async function pilotReport(actor: string, input: z.infer<typeof recordInput>) {
	await authorizeRestaurantScope(db, actor, input);
	const row = await record(db, input.storeId, input.recordId, "batch_result");
	const decisions = await db
		.select()
		.from(restaurantGeoRecords)
		.where(and(eq(restaurantGeoRecords.storeId, input.storeId), eq(restaurantGeoRecords.kind, "judgment")))
		.orderBy(restaurantGeoRecords.createdAt, restaurantGeoRecords.id);
	const judgments = decisions
		.filter((r) => r.payload.batchRecordId === row.id)
		.map((r) => r.payload as unknown as Judgment);
	const batch = row.payload as unknown as PilotBatch;
	return {
		batch,
		groups: summarizeBatch(batch, judgments),
		judgments,
		generatedAt: new Date().toISOString(),
		limitations: [
			"统计来自当前批次的人工复核；未回答、未复核或不确定的样本分别保留。",
			"浏览器引用只包含已采集的可见外链，不能证明引用完整。",
			"历史 Excel 观察不进入当前分母。",
		],
	};
}
export async function saveGeoSchedule(actor: string, input: z.infer<typeof scheduleInput>) {
	if (input.enabled) assertHtmlSource(input.channel, input.url);
	return db.transaction(async (tx) => {
		await authorizeRestaurantScope(tx, actor, input, true);
		return append(tx, actor, input.storeId, "schedule", crypto.randomUUID(), {
			...input,
			intervalDays: 7,
			scope: "channel_and_website_only",
			aiQueries: "require_ready_local_browser",
		});
	});
}

export async function queueDueGeoChecks(now = new Date()) {
	const rows = await db
		.select({ record: restaurantGeoRecords, organizationId: brands.organizationId })
		.from(restaurantGeoRecords)
		.innerJoin(restaurantStores, eq(restaurantGeoRecords.storeId, restaurantStores.id))
		.innerJoin(brands, eq(restaurantStores.brandId, brands.id))
		.where(eq(restaurantGeoRecords.kind, "schedule"))
		.orderBy(desc(restaurantGeoRecords.createdAt), desc(restaurantGeoRecords.id));
	const seen = new Set<string>();
	for (const { record: schedule, organizationId } of rows) {
		const config = schedule.payload;
		if (isPlatformChannel(String(config.channel))) continue;
		const key = stableJson([schedule.storeId, config.channel, config.listingId]);
		if (seen.has(key)) continue;
		seen.add(key);
		if (!config.enabled) continue;
		try {
			await db.transaction(async (tx) => {
				await authorizeRestaurantScope(tx, schedule.createdBy, { organizationId, storeId: schedule.storeId }, true);
				const prior = await tx
					.select()
					.from(restaurantGeoRecords)
					.where(and(eq(restaurantGeoRecords.storeId, schedule.storeId), eq(restaurantGeoRecords.kind, "job_request")))
					.orderBy(desc(restaurantGeoRecords.createdAt));
				const latest = prior.find((row) => row.payload.scheduleId === schedule.id);
				if (latest && now.getTime() - latest.createdAt.getTime() < 7 * 86400000) return;
				await append(tx, schedule.createdBy, schedule.storeId, "job_request", crypto.randomUUID(), {
					organizationId,
					storeId: schedule.storeId,
					channel: config.channel,
					listingId: config.listingId,
					url: config.url,
					operation: "collect",
					scheduleId: schedule.id,
					requestedAt: now.toISOString(),
				});
			});
		} catch (error) {
			if (!(error instanceof Error) || !/无权|只有组织管理员|门店不存在/.test(error.message)) throw error;
		}
	}
}

export type GeoRecord = RecordRow;
