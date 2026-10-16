import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { getDeployment } from "@workspace/deployment";
import { storeInput } from "@workspace/lib/restaurants/facts";
import { platformBindInput, platformQueryInput } from "@workspace/lib/restaurants/geo/platform-contracts";
import { bindPlatform, listPlatformBindings, queryPlatform } from "@workspace/lib/restaurants/geo/platform-service";
import { requireAuthSession } from "@/lib/auth/helpers";

async function actor() {
	setResponseHeader("Cache-Control", "no-store, private");
	setResponseHeader("Pragma", "no-cache");
	if (getDeployment().mode !== "local") throw new Error("平台查询当前仅在本地部署开放");
	return (await requireAuthSession()).user.id;
}
export const platformBindingsFn = createServerFn({ method: "POST" })
	.validator(storeInput)
	.handler(async ({ data }) => listPlatformBindings(await actor(), data));
export const platformQueryFn = createServerFn({ method: "POST" })
	.validator(platformQueryInput)
	.handler(async ({ data }) => queryPlatform(await actor(), data));
export const platformBindFn = createServerFn({ method: "POST" })
	.validator(platformBindInput)
	.handler(async ({ data }) => bindPlatform(await actor(), data));
