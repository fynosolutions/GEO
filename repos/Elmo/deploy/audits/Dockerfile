FROM node:24-bookworm-slim AS app

ARG PNPM_VERSION=12.4.1
ARG VITE_APP_URL=https://reports.example.com
ENV PNPM_HOME=/opt/pnpm
ENV PATH=/opt/pnpm:$PATH
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV VITE_APP_URL=$VITE_APP_URL

RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-requests python3-bs4 python3-lxml python3-click python3-urllib3 \
    ca-certificates fonts-dejavu-core fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/repos/Elmo
COPY Elmo/ /app/repos/Elmo/
COPY geo-optimizer-skill/src/ /app/repos/geo-optimizer-skill/src/
COPY geo-optimizer-skill/LICENSE /app/repos/geo-optimizer-skill/LICENSE
COPY geo-optimizer-skill/pyproject.toml /app/repos/geo-optimizer-skill/pyproject.toml

# The checked-in workspace policy applies to this install without exclusions.
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @workspace/web exec playwright install --with-deps chromium
RUN pnpm --filter @workspace/web build
RUN mkdir -p /var/lib/elmo-audits /var/lib/elmo-audit-drill \
    && chown -R node:node /var/lib/elmo-audits /var/lib/elmo-audit-drill /app/repos/Elmo

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV GEO_PROJECT_ROOT=/app/repos/Elmo
ENV GEO_PYTHON=/usr/bin/python3
ENV AUDIT_STORAGE_DIR=/var/lib/elmo-audits
ENV DISABLE_TELEMETRY=1
USER node
EXPOSE 3000
CMD ["node", "apps/web/.output/server/index.mjs"]
