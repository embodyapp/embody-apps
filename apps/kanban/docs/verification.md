# Verification record

## 2026-10-02 — local implementation (uncommitted working tree)

Environment: Node 24.21.0, pnpm 10.34.6, TypeScript 5.9.3, Vitest 4.1.11, Zod 4.6.5, all installed Embody packages 0.1.0, better-sqlite3 13.0.3. Package versions and source contracts are in [framework-contracts.md](framework-contracts.md).

### Scaffold/install observations

- `pnpm create embody-app apps/kanban` exited **1**: scaffold 0.1.0 accepts a simple project name, not a slash-containing path.
- Preserved the existing `apps/kanban` documentation temporarily outside the target. `(cd apps && pnpm create embody-app kanban)` exited **0**. Restored the original README and plan, then updated them with implementation status; no specification content was lost.
- Root `pnpm install` exited **0**. Initial warning noted better-sqlite3 build-script approval. Workspace now explicitly lists better-sqlite3 in `onlyBuiltDependencies`; `pnpm install --frozen-lockfile` exited **0**, lockfile current.
- Only root `pnpm-lock.yaml` exists outside dependency directories; no nested workspace or app-local lockfile.
- Package is private ESM `@embody-apps/kanban`, with Node 22/24 engines and actual typecheck/test/build scripts.

### Exact final verification commands

All run from repository root; each exits **0**:

```sh
pnpm install --frozen-lockfile
pnpm --filter './apps/kanban' typecheck
pnpm --filter './apps/kanban' test
pnpm --filter './apps/kanban' build
pnpm check
```

Final test summary: **5 test files, 17 passing tests, no skipped tests**. `pnpm check` runs the app's typecheck, real tests and build, not empty recursive scripts. Builds exclude test sources; Vitest explicitly selects `src/**/*.test.ts` so stale generated tests cannot double-count results. Tests themselves are included in typecheck.

During development the schema/relationship/workflow suites were observed failing for missing targets and missing policies before implementation. Tests also exposed Zod partial defaults resetting omitted task state; preprocessing defaults and a persisted-state regression test fixed this. An early run picked up compiled test duplicates; the explicit test selection fixed that, and the final count above is the source suite only.

### Live local host observation

Executed after building, with app working directory:

```sh
node node_modules/@embody/cli/bin/embody.js dev dist/embody.config.js
```

This is the CLI invocation used by the documented `pnpm --filter './apps/kanban' dev` script after its build. Queried the real TCP listener, not a mocked host:

```text
GET http://127.0.0.1:3031/health → HTTP 200
{"appId":"kanban","version":"0.1.0","live":true,"ready":true}
GET /__inspector/manifest → HTTP 200; tracker.getTaskContext present
POST /__inspector/execute
  {"target":"tracker.project.create","input":{"data":{"name":"My project"}}}
→ HTTP 200; data {"name":"My project","description":""}, UUID record ID
```

Startup output identified `Embody Host running on http://127.0.0.1:3031` and the loopback inspector. It listed all three generated entity operation families and `tracker.addComment`/`tracker.getTaskContext`. `lsof -n -iTCP:3031 -sTCP:LISTEN` showed **127.0.0.1**, not a wildcard listener. SIGTERM shutdown exited **0**, and the listener disappeared. Local development catalog deliberately includes generated denied-by-hook operations; this is not evidence of gateway principal-filtered catalogs.

`git check-ignore apps/kanban/.embody/kanban.sqlite apps/kanban/dist/embody.config.js` identifies both as ignored. `git ls-files '*.sqlite*' '*.db*' '*/dist/*' '.env' '*/.env'` returned no tracked generated databases/output or environment secrets. No credentials were supplied or captured.

### Requirement-to-test mapping

All tests call the production kernel, access stored records through Embody, and close harness/runtime resources.

| Requirement | Named passing tests / file |
| --- | --- |
| Real kernel/config smoke, IDs, required task fields/defaults | `persists project and task defaults through generated operations` — `src/plugin.test.ts` |
| Required text/status validation | `rejects missing or blank required text and invalid statuses on create and update` — `src/schema.test.ts` |
| Generated partial updates preserve data | `partial updates never reset omitted defaults or relationships` — `src/schema.test.ts` |
| Multiple projects, organization isolation, child pagination | `project filters and paginated child reads isolate projects without missing records` — `src/schema.test.ts` |
| Valid org/project relationships, duplicates, self links, project immutability | `rejects invalid references, duplicate blockers, and project moves without changing records` — `src/relationships.test.ts` |
| Dependency/hierarchy cycles | `rejects indirect dependency and hierarchy cycles`; `checks graph edges beyond the first hundred records` — `src/relationships.test.ts` |
| Restrictive deletion, incoming relationships, human owner policy | `prevents dangling records and requires an explicit owner role for deletion` — `src/relationships.test.ts` |
| Concurrent graph integrity | `conflicting concurrent dependency and hierarchy edits cannot commit cycles` — `src/relationships.test.ts`; verifies overlap rejection and exactly one persisted edge for each graph kind |
| Four statuses, cancellation does not resolve blockers, explicit removal, reopening, independent subtasks | `only done resolves blockers; cancellation and reopening preserve dependency links` — `src/workflows.test.ts` |
| Cancellation/reason edits/reopen history and attributed records | `requires cancellation reasons and keeps attributed decision history on reason edits and reopening` — `src/workflows.test.ts` |
| Agent/human authorship, generated-create spoofing, append-only comments, comment-protected task deletion | `attributes human and agent comments, overwrites spoofing at generated create, and forbids mutation` — `src/workflows.test.ts` |
| Atomic task/history rollback | `rolls back a canceled task and its history if comment creation fails` — `src/workflows.test.ts`; injected afterCreate hook veto, persisted task remains todo, comment list empty |
| Bounded child context and chronological evidence beyond default page | `bounds context children and paginates chronological comments without duplicates` — `src/workflows.test.ts` |
| Kernel least-privilege authorization | `least-privilege agents can work but cannot invoke generated comment create or deletes` — `src/workflows.test.ts`; valid forbidden payloads fail with Permission denied, no-scope read denied |
| Host startup/health/discovery/cleanup | `starts a loopback inspector with health and tracker discovery and shuts down` — `src/host.test.ts`, plus TCP check above |
| Persistence restart and backup restore | `preserves IDs, relationships and decision comments through restart and offline backup restore` — `src/host.test.ts`; compares full context/comments before and after original restart and separate offline-copy restore |

### Phase acceptance status (not waived)

- **Phase 1 local scaffold/API verification:** observed installation, targeted scripts, nonempty config/kernel smoke, live host health/discovery/shutdown, unique local port/database, and documented installed contracts. Native-build approval is explicit. A separate clean-machine install has not been exercised.
- **Phase 2 implementation:** entity policies and tests above pass. This is not a declaration that every exhaustive Section 9 create/update variation or every bound-limit fixture has been covered. Graph behavior is claimed only for the supported SQLite adapter, including its rejection of overlap; PostgreSQL remains blocked.
- **Phase 3:** custom actions, kernel scope tests and attribution exist; **actual gateway catalog, CLI inspection, MCP discovery/calls and a credentialed deployed agent scenario are not executed**.
- **Phase 4:** local restart/offline backup drill and loopback bind checks pass; **deployed acceptance, clean-environment reproduction, external-network checks, TLS, credential rotation and gateway re-registration remain unverified**.

At the initial verification above, no gateway or production credentials were available. See the subsequent local gateway check below; it does not substitute for remote/production acceptance. See [operations.md](operations.md) for repeatable local commands and the remaining deployment checklist.

## Follow-up — local authenticated gateway

Added `scripts/dev-gateway.mjs`, using installed `@embody/gateway` and `@embody/auth` 0.1.0 public APIs. `pnpm --filter './apps/kanban' dev:gateway` runs both loopback listeners, registry registration/heartbeat, random API-key authentication and JWT app verification. The private `.embody/dev-cli.env` holds the disposable client credential (not recorded here). The authenticated principal is human `local-owner`, org `local`, role `owner`; gateway and kernel scope namespaces are supplied separately.

Observed on the running gateway/app:

- App `/health`: HTTP 200, appId kanban, ready true.
- `pnpm exec embody apps list`: exit 0, `kanban` listed.
- `pnpm exec embody kanban task get 42f4548c-b328-41f4-970e-5faeb23fd284 --output json`: exit 0, correct stored sample task returned.
- `pnpm exec embody kanban task delete 42f4548c-b328-41f4-970e-5faeb23fd284`: exit 6, CLI reports `Remote execution failed`.
- Diagnostic authenticated call to the same gateway delete target: HTTP 422, `HOOK_VETO`, `Task cannot be deleted while comments or task references exist.` Task remains stored. No policy bypass was performed.
- Unauthenticated gateway `/api/catalog`: HTTP 401.

This verifies local registration and CLI authentication, not successful deletion of a history-protected task. Remote TLS, MCP, agent least-privilege gateway catalog filtering, production isolation and full deployment acceptance remain unverified.
