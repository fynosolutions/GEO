import { db } from "@workspace/lib/db/db";
import { collectInput } from "@workspace/lib/restaurants/geo/contracts";
import { isPlatformChannel } from "@workspace/lib/restaurants/geo/platform-contracts";
import { runCollector } from "@workspace/lib/restaurants/geo/runtime";
import { queueDueGeoChecks, saveCollectorResult } from "@workspace/lib/restaurants/geo/service";
import { sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";

type Request = { id: string; store_id: string; created_by: string; payload: Record<string, unknown> };
export async function registerRestaurantGeo(boss: PgBoss) {
	await boss.createQueue("restaurant-geo-dispatch", { retryLimit: 1, expireInSeconds: 120 });
	await boss.createQueue("restaurant-geo-collect", { retryLimit: 1, retryDelay: 60, expireInSeconds: 420 });
	await boss.schedule("restaurant-geo-dispatch", "* * * * *", {}, { tz: "UTC" });
	await boss.work("restaurant-geo-dispatch", { localConcurrency: 1 }, async () => {
		await queueDueGeoChecks();
		const pending = await db.execute(sql`
			select r.id, r.store_id, r.created_by, r.payload from restaurant_geo_records r
			join restaurant_stores s on s.id = r.store_id join brands b on b.id = s.brand_id
			join member m on m.user_id = r.created_by and m.organization_id = b.organization_id
			where r.kind = 'job_request' and m.role in ('owner', 'admin')
			and coalesce(r.payload->>'channel', '') not in ('google_maps', 'yelp') and not exists (
			select 1 from restaurant_geo_records done where done.store_id = r.store_id and done.kind = 'job_result' and done.key = r.id::text)
			order by r.created_at limit 25`);
		for (const row of pending.rows as Request[])
			await boss.send("restaurant-geo-collect", row, { singletonKey: row.id, singletonSeconds: 600 });
	});
	await boss.work<Request>("restaurant-geo-collect", { localConcurrency: 1 }, async (jobs) => {
		for (const job of jobs) {
			const request = job.data;
			if (isPlatformChannel(String(request.payload.channel))) continue;
			const input = collectInput.parse(request.payload);
			let result: Awaited<ReturnType<typeof runCollector>>;
			try {
				result = await runCollector({ ...input, snapshotId: request.id });
			} catch (error) {
				result = {
					snapshot: {
						schemaVersion: "geo.snapshot.v1",
						id: request.id,
						storeId: input.storeId,
						channel: input.channel,
						listingId: input.listingId,
						url: input.url,
						collectedAt: new Date().toISOString(),
						method: "automatic",
						collectorVersion: "geo-static-1.0.0",
						status: "failed",
						error: error instanceof Error ? error.message.slice(0, 2000) : "采集失败",
						fields: {},
						evidence: [],
					},
					websiteAudit: undefined,
				};
			}
			await saveCollectorResult(request.created_by, input, request.id, result.snapshot, result.websiteAudit);
		}
	});
}
