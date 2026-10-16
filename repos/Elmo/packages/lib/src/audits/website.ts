import { spawn } from "node:child_process";
import path from "node:path";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { geoRoot } from "../restaurants/geo/runtime";
import type { RestaurantWebsiteResult } from "./contracts";

export type WebsiteCollection = {
	website: RestaurantWebsiteResult;
	evidence: { id: string; body: string; mediaType: string }[];
	pages: { url: string; html: string }[];
};

export async function runWebsiteBridge(url: string, mode: "full" | "excerpt" = "full"): Promise<WebsiteCollection> {
	const root = geoRoot();
	const output = await new Promise<string>((resolve, reject) => {
		const child = spawn(process.env.GEO_PYTHON ?? "python", [path.join(root, "integrations/geo/audit_website.py")], {
			shell: false,
			windowsHide: true,
			stdio: ["pipe", "pipe", "pipe"],
			env: {
				PATH: process.env.PATH,
				SystemRoot: process.env.SystemRoot,
				TEMP: process.env.TEMP,
				TMP: process.env.TMP,
				PYTHONPATH: [
					path.resolve(root, "../geo-optimizer-skill/src"),
					path.resolve(root, "../../.test-python"),
					process.env.PYTHONPATH,
				]
					.filter(Boolean)
					.join(path.delimiter),
				PYTHONIOENCODING: "utf-8",
			} as unknown as NodeJS.ProcessEnv,
		});
		let stdout = "";
		let stderr = "";
		const timer = setTimeout(() => {
			child.kill();
			reject(new Error("Website preparation exceeded its time limit"));
		}, 180000);
		child.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString("utf8");
			if (stdout.length > 30_000_000) {
				child.kill();
				reject(new Error("Website preparation exceeded its size limit"));
			}
		});
		child.stderr.on("data", (chunk: Buffer) => {
			stderr = (stderr + chunk.toString("utf8")).slice(-1000);
		});
		child.on("error", (error) => {
			clearTimeout(timer);
			reject(error);
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			if (code === 0) resolve(stdout);
			else reject(new Error(`Website collection failed (${code ?? "terminated"}): ${stderr || "collector error"}`));
		});
		child.stdin.on("error", () => {});
		child.stdin.end(JSON.stringify({ url, mode }));
	});
	const result = JSON.parse(output) as WebsiteCollection;
	if (!result.website?.pageFetch || !Array.isArray(result.pages) || !Array.isArray(result.evidence))
		throw new Error("Invalid website collector response");
	return result;
}

export async function prepareRestaurantSubject(url: string, collect = runWebsiteBridge): Promise<WebsiteCollection> {
	return collect(url, "full");
}

export async function auditRestaurantWebsite(
	url: string,
	collect = runWebsiteBridge,
): Promise<RestaurantWebsiteResult> {
	return (await collect(url, "full")).website;
}

export async function getSafeWebsiteExcerpt(url: string, collect = runWebsiteBridge): Promise<string> {
	const result = await collect(url, "excerpt");
	const page = result.pages[0];
	if (!page) return "";
	const { document } = parseHTML(page.html);
	const content = new Readability(document).parse()?.textContent;
	if (content?.trim()) return content.trim().slice(0, 20000);
	const { document: fallback } = parseHTML(page.html);
	for (const node of fallback.querySelectorAll("script,style,noscript,template")) node.remove();
	return (fallback.body?.textContent ?? "").trim().slice(0, 20000);
}
