import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { type Scope, snapshotSchema } from "./contracts";
import { assertHtmlSource } from "./platform-contracts";

export function geoRoot() {
	if (process.env.GEO_PROJECT_ROOT) return path.resolve(process.env.GEO_PROJECT_ROOT);
	let folder = process.cwd();
	while (true) {
		if (existsSync(path.join(folder, "README-GEO-PILOT.md"))) return folder;
		const parent = path.dirname(folder);
		if (parent === folder) throw new Error("请配置 GEO_PROJECT_ROOT 为 Elmo 项目绝对路径");
		folder = parent;
	}
}
export const p0RunsRoot = () => process.env.GEO_P0_RUNS_DIR ?? path.resolve(geoRoot(), "../../p0-browser/runs");

export async function runCollector(
	input: Scope & { url: string; channel: string; listingId: string; snapshotId: string },
) {
	assertHtmlSource(input.channel, input.url);
	const root = geoRoot();
	const python = process.env.GEO_PYTHON ?? "python";
	const extraPythonPath = [
		path.resolve(root, "../geo-optimizer-skill/src"),
		path.resolve(root, "../../.test-python"),
		process.env.PYTHONPATH,
	]
		.filter(Boolean)
		.join(path.delimiter);
	const output = await new Promise<string>((resolve, reject) => {
		// The web app augments ProcessEnv with required credentials; this read-only child must not inherit them.
		const childEnv = {
			PATH: process.env.PATH,
			SystemRoot: process.env.SystemRoot,
			TEMP: process.env.TEMP,
			PYTHONPATH: extraPythonPath,
			PYTHONIOENCODING: "utf-8",
		} as unknown as NodeJS.ProcessEnv;
		const child = spawn(python, [path.join(root, "integrations/geo/collect.py")], {
			shell: false,
			windowsHide: true,
			stdio: ["pipe", "pipe", "pipe"],
			env: childEnv,
		});
		let stdout = "";
		let stderr = "";
		const timer = setTimeout(() => {
			child.kill();
			reject(new Error("官网/渠道检查超过五分钟，停止本次采集"));
		}, 300000);
		child.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString("utf8");
			if (stdout.length > 4_000_000) {
				child.kill();
				reject(new Error("采集返回超出大小限制"));
			}
		});
		child.stderr.on("data", (chunk: Buffer) => {
			stderr = (stderr + chunk.toString("utf8")).slice(-2000);
		});
		child.on("error", (error) => {
			clearTimeout(timer);
			reject(error);
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			if (code !== 0) reject(new Error(`采集组件失败：${stderr || stdout.slice(0, 1000)}`));
			else resolve(stdout);
		});
		child.stdin.on("error", () => {});
		child.stdin.end(JSON.stringify(input));
	});
	const parsed = JSON.parse(output);
	return {
		snapshot: snapshotSchema.parse(parsed.snapshot),
		websiteAudit: parsed.websiteAudit as Record<string, unknown> | undefined,
	};
}
