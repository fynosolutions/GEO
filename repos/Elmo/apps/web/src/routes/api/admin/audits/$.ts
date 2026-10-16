import { createFileRoute } from "@tanstack/react-router";
import { adminAuditHandler } from "@/server/public-audits";

export const Route = createFileRoute("/api/admin/audits/$")({
	server: {
		handlers: { GET: ({ request }) => adminAuditHandler(request), POST: ({ request }) => adminAuditHandler(request) },
	},
});
