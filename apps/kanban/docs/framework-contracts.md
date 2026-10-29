# Verified framework contracts

Inspected 2026-10-02 against installed `@embody/{core,host,storage,testing,auth,cli}` **0.1.0**, Zod **4.6.5**, TypeScript **5.9.3**, Vitest **4.1.11**, better-sqlite3 **13.0.3**, Node **24.21.0**, pnpm **10.34.6**.

Paths below are relative to the named installed package, e.g. `apps/kanban/node_modules/@embody/core/dist/contracts.d.ts`. Transitive storage/auth packages are under root `node_modules/.pnpm`.

| Contract | Verified declaration / implementation |
| --- | --- |
| IDs / envelope | core `dist/contracts.d.ts`: `EntityRecord`; storage `dist/sqlite.js`: creation uses `randomUUID()`. ID, orgId, entityType, createdAt, updatedAt surround business `data`. |
| Principal | core `dist/contracts.d.ts`: orgId, actorId, actorType (`human`, `agent`, `system`), roles, scopes. Caller identity is request-local. |
| CRUD | core `dist/entities.js`: generated `{data}`, `{id}`, `{id,data}` and list input. `KernelContext.entities` is keyed by unqualified entity names. Reads enforce org ownership. |
| Hooks | core `dist/entities.js` and `dist/kernel.js`: beforeCreate `{data}` (normalized mutable object), afterCreate `{record}`, beforeUpdate `{current,patch}`, afterUpdate `{current,updated}`, beforeDelete `{current}`. Register fully qualified keys, e.g. `tracker.task.beforeCreate`. `HookVetoError` retains actionable policy messages; other exceptions are wrapped as hook failures. |
| Filtering / indexes | core `dist/entities.js`: equality filters over declared fields, one business-field sort. storage `dist/sqlite.js`: JSON equality filters. Index definitions name schema fields; no array membership operator is assumed. Reverse blockers use full project scans. |
| Pagination | core `dist/entities.js`: limit 1–100 (default 20), offset >=0. SQLite defaults to ID ascending, NOT chronological timestamp order. Cannot sort generated lists by envelope timestamps. |
| Comment ordering | App adds server-controlled per-task `sequence` and a default ascending sort. Hook assigns max+1 in the action transaction. This is an ordering key, not a duplicate timestamp or ID. Page requests are individually consistent, not snapshot pagination; do not override sort when reading chronological evidence. |
| Patch defaults | Zod 4 `.default()` inside `.partial()` inserts defaults into omitted fields! App uses `z.preprocess` defaults for project/task fields instead; regression test verifies generated updates retain omitted state and relationships. Comments cannot be updated. |
| Atomic actions | core `dist/kernel.js` `execute`: each action executes within `storage.transaction`; nested entity accessors share the same transaction. Hook writes and outbox writes roll back together on failure. Verified with injected comment afterCreate failure. |
| SQLite isolation | storage `dist/sqlite.js` `SqliteStorage.transaction`: `BEGIN IMMEDIATE`, commit/rollback, `active` guard. Simultaneous requests on a connection are rejected with `Nested SQLite transactions are not supported`, not queued. Conflicting graph test verifies at most one edge commits. This is not retry/idempotency or optimistic concurrency at the client boundary. |
| Update conflicts | core `dist/entities.js`: accessor reads current record then passes `expectedUpdatedAt` to storage. Generated input has no revision parameter; stale client read-modify-write can overwrite a later blocker list. |
| Auth / scopes | core `dist/kernel.js`: input validation precedes scope check; scope matching supports exact dotted or colon-separated targets and colon-prefix wildcards. Application hooks cannot rely on gateway filtering alone. Agent deletion also requires a human `owner` role at the hook boundary. |
| Local host | cli `dist/dev.js`: loopback-only inspector, `port` and `sqlitePath` config; config loader is native Node import and does not map `.js` source imports to `.ts`. `dev` builds then loads `dist/embody.config.js`. Restart dev after source edits. |
| Host / registration | host `dist/index.d.ts` / `dist/index.js`: `createAppHost`, `defineApp`, health and authenticated `/execute`, gateway registration with appId, endpoint, manifest, registration secret and heartbeat. Dev inspector manifest is plugin/target discovery; configured app ID appears in `/health`. |
| Production requirements | host `README.md` and `parseAppEnvironment`: production requires PostgreSQL and gateway/TLS configuration. This release's entry point refuses `DATABASE_URL`; PostgreSQL graph isolation is unverified. Do not deploy this SQLite release as a production host. |

## Explicit blockers / unsupported claims

- Follow-up local gateway checks now verify registration, CLI discovery/read and policy-denied deletion, plus unauthenticated catalog rejection. The official development launcher generates separate disposable API-key, registration and JWT-signing secrets. MCP discovery/invocation, TLS, external network denial, production credential rotation and full deployment re-registration are **not verified**.
- PostgreSQL transaction isolation and cross-process concurrent graph mutation have **not** been established. Only the SQLite runtime is supported by this release; do not substitute a PostgreSQL adapter into the plugin and assume cycle safety.
- SQLite overlap rejection may also affect concurrent reads and background worker activity. Clients must coordinate/re-read, not assume serialized queuing. No client revision checks, atomic dependency add/remove, work claiming or idempotency are promised.
- Project graphs are explicitly limited to 1000 tasks and each task to 100 blockers. Exhaustive scans are paginated and reject over-limit data. These are v1 workload bounds, not silent truncation.
- Docker recipe is adjusted for root workspace installs but has not been built/tested in this environment.
