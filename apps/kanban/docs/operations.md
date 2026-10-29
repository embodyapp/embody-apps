# Local operations

## Supported boundary

This release is local, single-host SQLite. The development host binds to `127.0.0.1:3031`; its inspector deliberately has development identity and is not a public authentication boundary. Do not tunnel, proxy, port-publish or bind it publicly. Conventional `start` is also loopback in development and has no inspector routes.

Production requires PostgreSQL in the installed framework. Graph isolation on PostgreSQL is unverified, so the app entry point refuses `DATABASE_URL`. Do not bypass this guard for a production deployment. Docker is an untested local recipe, not an approved deployment.

## Install, start, stop and health

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm --filter './apps/kanban' dev
```

`pnpm-workspace.yaml` explicitly allows better-sqlite3's native build script. Keep Node on 22 or 24. No credentials are required for loopback-only development.

In a second terminal:

```sh
curl -fsS http://127.0.0.1:3031/health
curl -fsS http://127.0.0.1:3031/__inspector/manifest
```

Expected health: appId `kanban`, `live: true`, `ready: true`. Stop with Ctrl-C, wait for shutdown, then run the same start command to restart. Data remains in `apps/kanban/.embody/kanban.sqlite`. Never run multiple app processes on that database. Restart development after editing source; the compiled config watcher is not a source hot-reloader.

Alternatively copy `.env.example` to the ignored app-local `.env`, adjust local settings, and run `pnpm --filter './apps/kanban' start`. `start` builds automatically and loads `.env`. The CLI `dev` uses config `port`/`sqlitePath` instead of `.env`.

## Offline backup and restore

Stop the app cleanly first. This method requires downtime for the entire copy. Do not copy a live SQLite file (uncheckpointed WAL data may be missed).

```sh
# Repository root, AFTER the app has stopped:
mkdir -p "$HOME/kanban-backups"
cp apps/kanban/.embody/kanban.sqlite "$HOME/kanban-backups/kanban-$(date +%Y%m%d-%H%M%S).sqlite"
```

Protect backups as task data; do not commit them. Verify free space and restrict directory access according to your environment. Restore to a separate database to validate before replacing live data:

```sh
cp "$HOME/kanban-backups/<chosen-backup>.sqlite" apps/kanban/.embody/restored.sqlite
# Conventional runtime, not dev (uses DATABASE_FILE):
DATABASE_FILE=.embody/restored.sqlite pnpm --filter './apps/kanban' start
```

Read representative projects/tasks/comments through the app, verify IDs, parent and blocker links, then stop. Do not delete or replace WAL/SHM files belonging to a running process. The automated `host.test.ts` drill shuts down, copies to a separate clean path, reopens both original and restored databases, and compares task context and comment records exactly.

## Agent permissions for a future gateway

Provision organization-scoped principals externally, not in this plugin. Recommended normal agent scopes at the kernel boundary:

```text
tracker:project:create  tracker:project:get  tracker:project:list  tracker:project:update
tracker:task:create     tracker:task:get     tracker:task:list     tracker:task:update
tracker:comment:get    tracker:comment:list
tracker:addComment     tracker:getTaskContext
```

No generated comment create/update/delete or project/task deletes. Hook policies still protect authorship and immutability even for overbroad credentials. Destructive operations require both appropriate scopes and a human `owner` role supplied by trusted identity. Do not give agents wildcard scopes.

Gateway deployment may prefix scopes/targets with app ID; inspect the deployed catalog and installed gateway contracts before provisioning. No gateway exists in this verification environment, so these are tested kernel permissions, not tested gateway credential settings.

Keep host registration signing, host gateway JWT verification and client bearer tokens as separate secrets. Never put actual tokens in documentation or command arguments. Use ignored environment files or a secret manager.

## Remaining deployment acceptance

Before remote use, choose a gateway/hosting boundary, establish PostgreSQL graph serialization, register the app, verify app-scoped CLI/MCP discovery and calls, test unauthenticated and destructive-call denials externally, configure TLS/backups, and exercise credential rotation and re-registration with disposable credentials. Follow the unchanged phase acceptance contract in `plan.md`; none of these operational checks have been replaced by harness tests.
