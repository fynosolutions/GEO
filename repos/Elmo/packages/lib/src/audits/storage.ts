import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { decryptSecret, encryptSecret, getKeyring } from "../secrets/crypto";

export const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");
export const auditStorageRoot = () => path.resolve(process.env.AUDIT_STORAGE_DIR ?? ".audit-private");
const idPattern = /^[a-f\d-]{36}$/i;

function artifactPath(auditId: string, key: string) {
	if (!idPattern.test(auditId) || !/^[a-zA-Z\d._-]{1,160}$/.test(key) || key === "." || key === "..") {
		throw new Error("Invalid artifact reference");
	}
	const root = auditStorageRoot();
	const target = path.resolve(root, auditId, key);
	if (!target.startsWith(`${root}${path.sep}`)) throw new Error("Invalid artifact reference");
	return target;
}

export async function writeAuditArtifact(auditId: string, key: string, value: string | Buffer) {
	const target = artifactPath(auditId, key);
	await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
	const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
	if (bytes.length > 40_000_000) throw new Error("Artifact exceeds the size limit");
	const temporary = `${target}.${randomBytes(8).toString("hex")}.tmp`;
	await writeFile(temporary, bytes, { mode: 0o600, flag: "wx" });
	await rename(temporary, target);
	return { id: key, path: key, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length };
}

export async function readAuditArtifact(auditId: string, key: string): Promise<Buffer> {
	const target = artifactPath(auditId, key);
	const resolvedRoot = await realpath(auditStorageRoot());
	const resolved = await realpath(target);
	if (!resolved.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error("Invalid artifact reference");
	if ((await stat(resolved)).size > 40_000_000) throw new Error("Artifact exceeds the size limit");
	return readFile(resolved);
}

export async function eraseAuditArtifacts(auditId: string) {
	if (!idPattern.test(auditId)) throw new Error("Invalid audit");
	const root = auditStorageRoot();
	const target = path.resolve(root, auditId);
	if (path.dirname(target) !== root) throw new Error("Invalid artifact reference");
	await rm(target, { recursive: true, force: true });
}

export async function sealAuditPayload(auditId: string, payload: unknown) {
	const keyring = getKeyring();
	if (!keyring) throw new Error("Private delivery encryption is not configured");
	return { sealed: await encryptSecret(JSON.stringify(payload), { key: keyring.primary, aad: `audit:${auditId}` }) };
}

export async function unsealAuditPayload<T>(auditId: string, payload: unknown): Promise<T> {
	const keyring = getKeyring();
	if (!keyring || !payload || typeof payload !== "object" || !("sealed" in payload)) {
		throw new Error("Private delivery is unavailable");
	}
	return JSON.parse(await decryptSecret(payload.sealed, { keyring, aad: `audit:${auditId}` })) as T;
}

export function publicAuditValue(value: unknown): unknown {
	if (value instanceof Date) return value.toISOString();
	if (Array.isArray(value)) return value.map(publicAuditValue);
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value)
				.filter(([key]) => !["path", "sealed", "tokenHash", "token_hash", "ip_hash"].includes(key))
				.map(([key, item]) => [key, publicAuditValue(item)]),
		);
	}
	return value;
}
