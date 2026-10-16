import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { builtinModules, createRequire, syncBuiltinESMExports } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

async function exerciseBundle() {
	const dns = (await import("node:dns/promises")).default;
	const http = (await import("node:http")).default;
	const https = (await import("node:https")).default;
	const childProcess = (await import("node:child_process")).default;
	const { EventEmitter } = await import("node:events");
	const { Readable } = await import("node:stream");
	const requests = [];
	let readerAvailable = true;
	let dnsChecks = 0;
	let childProcessAttempts = 0;
	dns.lookup = async (hostname) => {
		dnsChecks++;
		return [{ address: hostname === "private.example" ? "10.1.2.3" : "93.184.216.34", family: 4 }];
	};
	const request = (options, callback) => {
		assert.ok(["r.jina.ai", "legacy-restaurant.example"].includes(options.hostname));
		assert.equal(options.agent, false);
		options.lookup(options.hostname, {}, (error, address, family) => {
			assert.equal(error, null);
			assert.equal(address, "93.184.216.34");
			assert.equal(family, 4);
		});
		requests.push({ host: options.hostname, path: options.path, authenticated: Boolean(options.headers.authorization) });
		const outgoing = new EventEmitter();
		outgoing.end = () => queueMicrotask(() => {
			const reader = options.hostname === "r.jina.ai";
			const body = reader
				? "Restaurant Menu\nOur restaurant serves lunch and dinner."
				: "<!doctype html><html><head><title>Restaurant menu</title></head><body><main><article><h1>Restaurant menu</h1><p>Our restaurant serves handmade dumplings for lunch and dinner. Enjoy fresh noodles, steamed buns and seasonal vegetables with family and friends.</p></article></main><script>PRIVATE_SCRIPT_CONTENT</script></body></html>";
			const response = Readable.from([Buffer.from(body)]);
			response.statusCode = reader && !readerAvailable ? 401 : 200;
			response.headers = { "content-type": reader ? "text/plain; charset=utf-8" : "text/html; charset=utf-8" };
			response.complete = true;
			callback(response);
		});
		return outgoing;
	};
	http.request = request;
	https.request = request;
	for (const method of ["spawn", "spawnSync", "exec", "execFile", "execSync", "execFileSync", "fork"]) {
		childProcess[method] = () => {
			childProcessAttempts++;
			throw new Error("A Node-only compatibility proof must not start a child process");
		};
	}
	syncBuiltinESMExports();
	const { getWebsiteExcerpt } = await import(new URL("./excerpt.mjs", import.meta.url));
	assert.equal(process.env.PATH, "");
	assert.equal(await getWebsiteExcerpt("legacy-restaurant.example"), "Restaurant Menu\nOur restaurant serves lunch and dinner.");
	assert.equal(requests.length, 1);
	assert.equal(requests[0].host, "r.jina.ai");
	assert.equal(requests[0].authenticated, true);
	readerAvailable = false;
	const fallback = await getWebsiteExcerpt("https://legacy-restaurant.example/menu");
	assert.ok(fallback.includes("handmade dumplings"));
	assert.ok(!fallback.includes("PRIVATE_SCRIPT_CONTENT"));
	assert.deepEqual(requests.slice(1).map(({ host }) => host), ["r.jina.ai", "legacy-restaurant.example"]);
	assert.equal(requests[2].authenticated, false);
	const requestCount = requests.length;
	for (const value of ["http://127.0.0.1/", "https://private.example/", "http://[::1]/", "https://localhost/", "file:///tmp/private"]) {
		assert.equal(await getWebsiteExcerpt(value), "");
	}
	assert.equal(requests.length, requestCount);
	assert.equal(childProcessAttempts, 0);
	return {
		node: process.version,
		platform: process.platform,
		architecture: process.arch,
		readerSuccess: true,
		reader401DirectFallback: true,
		untrustedHtmlRemoved: true,
		privateInputsBlocked: 5,
		dnsChecks,
		fixtureHttpRequests: requests.length,
		realNetworkRequests: 0,
		modelCalls: 0,
		emails: 0,
		childProcessAttempts,
		emptyPath: true,
		invalidPythonConfigured: true,
		absentGeoCheckoutConfigured: true,
	};
}

async function prepareAndRun() {
	const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
	const state = path.join(root, "deploy/audits/.state/legacy-node-proof");
	await mkdir(state, { recursive: true });
	const require = createRequire(import.meta.url);
	const buildRequire = createRequire(require.resolve("tsx"));
	const { build } = await import(pathToFileURL(buildRequire.resolve("esbuild")).href);
	const libRequire = createRequire(path.join(root, "packages/lib/package.json"));
	const canvasShim = path.join(path.dirname(libRequire.resolve("linkedom/package.json")), "commonjs/canvas-shim.cjs");
	const bundled = await build({
		absWorkingDir: root,
		entryPoints: ["packages/lib/src/website-excerpt.ts"],
		outfile: path.join(state, "excerpt.mjs"),
		bundle: true,
		platform: "node",
		format: "esm",
		target: "node24",
		metafile: true,
		// Node-only installations use this same dependency-provided optional-peer fallback.
		alias: { canvas: canvasShim },
		logLevel: "silent",
	});
	const imports = Object.values(bundled.metafile.outputs).flatMap((output) => output.imports);
	const builtins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);
	assert.ok(imports.every((entry) => !entry.external || builtins.has(entry.path)), "The proof must not require external packages");
	await writeFile(path.join(state, "proof.mjs"), await readFile(fileURLToPath(import.meta.url)));
	const temporary = await mkdtemp(path.join(os.tmpdir(), "elmo-legacy-node-proof-"));
	const artifact = path.join(temporary, "artifact");
	const cwd = path.join(temporary, "arbitrary-cwd");
	await mkdir(artifact);
	await mkdir(cwd);
	for (const name of ["excerpt.mjs", "proof.mjs"]) await writeFile(path.join(artifact, name), await readFile(path.join(state, name)));
	const child = spawnSync(process.execPath, [path.join(artifact, "proof.mjs"), "--run-bundle"], {
		cwd,
		encoding: "utf8",
		windowsHide: true,
		timeout: 30_000,
		env: {
			PATH: "",
			SystemRoot: process.env.SystemRoot ?? "",
			TEMP: os.tmpdir(),
			TMP: os.tmpdir(),
			GEO_PYTHON: path.join(temporary, "python-does-not-exist"),
			GEO_PROJECT_ROOT: path.join(temporary, "geo-checkout-does-not-exist"),
			JINA_API_KEY: "synthetic-reader-key",
			PUBLIC_AUDIT_ENABLED: "0",
			PUBLIC_AUDIT_LIVE_CALLS_ENABLED: "0",
		},
	});
	if (child.error) throw child.error;
	assert.equal(child.status, 0, child.stderr || child.stdout);
	const result = {
		...JSON.parse(child.stdout),
		productionEntryPoint: "packages/lib/src/website-excerpt.ts",
		bundleBytes: (await readFile(path.join(state, "excerpt.mjs"))).length,
		externalPackages: [],
		optionalCanvas: "linkedom dependency-provided canvas shim",
		sourceCheckoutRequired: false,
		nodeModulesRequiredAtRuntime: false,
		fullDockerBuildVerified: false,
	};
	await writeFile(path.join(state, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
	console.log(JSON.stringify(result, null, 2));
}

if (process.argv.includes("--run-bundle")) console.log(JSON.stringify(await exerciseBundle()));
else await prepareAndRun();
