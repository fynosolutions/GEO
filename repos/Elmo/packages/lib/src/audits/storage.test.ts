import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	eraseAuditArtifacts,
	newToken,
	publicAuditValue,
	readAuditArtifact,
	sealAuditPayload,
	tokenHash,
	unsealAuditPayload,
	writeAuditArtifact,
} from "./storage";

const auditId = "00000000-0000-4000-8000-000000000001";
let root: string;
beforeEach(async () => {
	root = await mkdtemp(path.join(os.tmpdir(), "elmo-audit-storage-"));
	vi.stubEnv("AUDIT_STORAGE_DIR", root);
	vi.stubEnv("ELMO_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
	vi.stubEnv("ELMO_ENCRYPTION_KEY_OLD", "");
});
afterEach(async () => {
	vi.unstubAllEnvs();
	const resolved = path.resolve(root);
	if (
		path.dirname(resolved) !== path.resolve(os.tmpdir()) ||
		!path.basename(resolved).startsWith("elmo-audit-storage-")
	)
		throw new Error("Refusing unexpected test cleanup target");
	await rm(resolved, { recursive: true, force: true });
});

describe("private audit evidence storage", () => {
	it("round-trips exact bytes and publishes their standard SHA-256 digest", async () => {
		const content = Buffer.from([0, 255, 1, 34, 123, 10]);
		const artifact = await writeAuditArtifact(auditId, "evidence.bin", content);
		expect(await readAuditArtifact(auditId, artifact.path)).toEqual(content);
		expect(artifact.sha256).toBe(createHash("sha256").update(content).digest("hex"));
		expect(artifact.bytes).toBe(content.length);
	});
	it("rejects traversal and malformed audit references before reading or writing", async () => {
		for (const key of ["../other.json", "..", ".", "nested/file.json", "nested\\file.json"])
			await expect(writeAuditArtifact(auditId, key, "blocked")).rejects.toThrow(/Invalid artifact/);
		await expect(writeAuditArtifact("../../other", "safe.json", "blocked")).rejects.toThrow(/Invalid artifact/);
		await expect(readAuditArtifact(auditId, "../other.json")).rejects.toThrow(/Invalid artifact/);
	});
	it("keeps private tokens encrypted in the queue and binds ciphertext to one audit", async () => {
		const data = { link: "https://report.example/audit/verify#token=fixture-secret" };
		const sealed = await sealAuditPayload(auditId, data);
		expect(JSON.stringify(sealed)).not.toContain("fixture-secret");
		expect(await unsealAuditPayload(auditId, sealed)).toEqual(data);
		await expect(unsealAuditPayload("00000000-0000-4000-8000-000000000002", sealed)).rejects.toThrow();
	});
	it("removes private storage, encrypted payloads and credential hashes from nested customer data", () => {
		const value = publicAuditValue({
			evidence: [{ id: "safe", path: "private/file", sha256: "visible" }],
			queue: { sealed: "secret" },
			tokenHash: "secret",
			token_hash: "secret",
			ip_hash: "secret",
		});
		expect(value).toEqual({ evidence: [{ id: "safe", sha256: "visible" }], queue: {} });
	});
	it("preserves timestamps as ISO text while stripping private fields", () => {
		expect(publicAuditValue({ createdAt: new Date("2026-10-16T12:00:00Z") })).toEqual({
			createdAt: "2026-10-16T12:00:00.000Z",
		});
	});
	it("generates unguessable URL-safe tokens and deletes only the named audit artifacts", async () => {
		const token = newToken();
		expect(token).toMatch(/^[A-Za-z\d_-]{43}$/);
		expect(tokenHash(token)).not.toBe(token);
		await writeAuditArtifact(auditId, "evidence.json", '{"ok":true}');
		const secondId = "00000000-0000-4000-8000-000000000002";
		await writeAuditArtifact(secondId, "evidence.json", "untouched");
		await eraseAuditArtifacts(auditId);
		await expect(readAuditArtifact(auditId, "evidence.json")).rejects.toThrow();
		expect((await readAuditArtifact(secondId, "evidence.json")).toString()).toBe("untouched");
	});
});
