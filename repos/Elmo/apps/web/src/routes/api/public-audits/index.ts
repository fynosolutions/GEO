import { createFileRoute } from "@tanstack/react-router";
import { publicAuditHandler } from "@/server/public-audits";

export const Route = createFileRoute("/api/public-audits/")({
	server: { handlers: { POST: ({ request }) => publicAuditHandler(request) } },
});
