# Collector development rules

Read root AGENTS.md and COLLABORATION.md. Current scope is issue #1: a file-oriented, read-only public restaurant collector. Do not migrate this branch to the receiving system's F1 stack or create another merchant database. Use npm ci and the Node/TypeScript baseline in package.json.

Expose shared entry points through public.ts. Keep UI orchestration in frontend/ and collection rules/adapters in backend/. Update API_CONTRACTS.md and consumer tests for contract changes. Add README.md for new directories. Use English UI/errors and preserve source text/units. Unknown facts must not be guessed or silently overwritten.

No customer login, platform writes, CAPTCHA bypass, private data publication or unsolicited GitHub comments. Secrets remain in environment variables. Do not commit out/, .local/, dist/ or node_modules/. Validate with npm run check, npm run build, npm test and git diff --check; distinguish live and OS acceptance evidence from fixture tests. User instructions to withhold commits/pushes override eventual upstream delivery steps.
