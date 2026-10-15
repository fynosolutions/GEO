import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let input = "";
for await (const chunk of process.stdin) {
	input += chunk;
	if (input.length > 5000) throw new Error("Invalid configuration input");
}
try {
	const { provider, key, ceiling, prior, purpose, confirmed } = JSON.parse(input);
	if (!["google", "yelp"].includes(provider) || confirmed !== true || !/^[A-Za-z0-9_.+/=-]{20,1000}$/.test(key)) throw new Error("Invalid configuration");
	const dollars = value => typeof value === "string" && /^(0|[1-9]\d?)(\.\d{1,6})?$/.test(value) && Number(value) <= 20;
	if (!dollars(ceiling) || Number(ceiling) <= 0 || !dollars(prior)) throw new Error("Invalid budget amounts");
	if (provider === "yelp" && !["evaluation", "display_authorized"].includes(purpose)) throw new Error("Invalid purpose");
	const values = provider === "google" ? {
		GEO_GOOGLE_PLACES_ENABLED: "true", GEO_GOOGLE_PLACES_API_KEY: key, GEO_GOOGLE_MAX_REQUEST_USD: ceiling,
	} : { GEO_YELP_API_KEY: key, GEO_YELP_PURPOSE: purpose, GEO_YELP_MAX_REQUEST_USD: ceiling };
	values.GEO_PLATFORM_PRIOR_SPEND_USD = prior;
	const files = [path.join(repo, ".env"), path.join(repo, "apps/web/.env")];
	const originals = await Promise.all(files.map(file => readFile(file, "utf8")));
	if (!originals.every(text => /^DEPLOYMENT_MODE=local\s*$/m.test(text))) throw new Error("Requires local deployment");
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	const backup = path.join(repo, ".restaurant-backups", `platform-config-${stamp}`);
	await mkdir(backup, { recursive: true });
	await Promise.all(originals.map((text, index) => writeFile(path.join(backup, index === 0 ? "root.env" : "web.env"), text, { mode: 0o600 })));
	try {
		for (let index = 0; index < files.length; index++) {
			const eol = originals[index].includes("\r\n") ? "\r\n" : "\n";
			const lines = originals[index].split(/\r?\n/).filter(line => !Object.keys(values).some(name => line.startsWith(`${name}=`)));
			const output = `${lines.join(eol).trimEnd()}${eol}${Object.entries(values).map(([name, value]) => `${name}=${value}`).join(eol)}${eol}`;
			const staged = `${files[index]}.platform-setup.tmp`;
			await writeFile(staged, output, { mode: 0o600 });
			await rename(staged, files[index]);
		}
	} catch {
		await Promise.all(files.map((file, index) => writeFile(file, originals[index], { mode: 0o600 })));
		throw new Error("Configuration rolled back");
	}
	console.log(JSON.stringify({ configured: true, provider, filesUpdated: 2, restartRequired: true, apiCallsMade: 0 }));
} catch {
	console.error("Configuration failed. No key was printed. Check the key, amounts and local environment files.");
	process.exitCode = 1;
}
