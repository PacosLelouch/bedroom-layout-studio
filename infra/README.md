# Process deployment baseline

This directory is the non-containerized development/private-test baseline from the cloud plan. It does not make uploaded JavaScript safe to execute.

- Run PostgreSQL with the generated migrations in `packages/database/migrations`.
- Install the API and Worker as different low-privilege users. Give the API access to object storage and business tables; give the Worker only pg-boss queue access, its task workspaces, the internal API capability token, and its Codex credential proxy.
- Keep `AGENT_EXECUTION_MODE=mock` until the trusted administrator workflow has been validated. `app-server` mode may execute repository commands and must not receive ordinary-user JS/TS.
- Put Caddy in front of the API and keep `/internal/*` unreachable from the public proxy. The supplied Caddyfile proxies only `/api/*` and `/healthz`.
- The systemd limits are a baseline, not the hardened untrusted-code boundary described by phase H. Use OCI/gVisor/Kata/VM isolation before enabling ordinary-user source execution.
- Back up PostgreSQL and the object store independently, and perform recovery tests. A single filesystem storage root is for development only.
