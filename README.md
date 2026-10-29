# Embody apps

A pnpm monorepo for our agent-native TypeScript applications built with Embody.

## Layout

```text
apps/                  Independently runnable Embody applications
packages/              Reusable plugins, adapters, and other shared code
pnpm-workspace.yaml    Workspace membership
tsconfig.base.json     Optional shared TypeScript defaults
```

Each app owns its `embody.config.ts`, plugins, tests, environment configuration,
and deployment setup. Kanban is a local SQLite task tracker with an experimental app-owned Embody GenUI board; production deployment remains unverified.

## Application plans

- [Kanban project](apps/kanban/README.md) — [specification and agent usage](apps/kanban/docs/plan.md), [verification](apps/kanban/docs/verification.md)
- [Hosting CRM](apps/crm/README.md) — [product, plugin boundaries and GenUI plan](apps/crm/docs/plan.md); local sales and onboarding foundation on port 3033.

Design GenUI for a narrow, vertically scrolling chat panel. See the
[GenUI layout principles](docs/genui-design.md) for compact cards, progressive
detail, navigation state and mobile verification.

## Setup

Use Node.js 22 or 24 (24 is the default in `.nvmrc`) and the pnpm version pinned
in `package.json`.

```sh
nvm use
corepack enable
node scripts/prepare-local-embody.mjs /absolute/path/to/built/embody-checkout
pnpm install
```

GenUI is not published to npm yet. The preparation command snapshots built official
packages into ignored `.embody/framework/`; root overrides keep the host, gateway,
CLI and GenUI on the same candidate. Build the source checkout first with its own
workspace commands. This integration was verified against commit
`1beb29309e45d3cfc9bd2c17525b625513e3de98` (`codex/genui-integration`).
The local checkout used was `/private/tmp/embody-genui-integration`; it is not needed
at runtime after preparation. Generated framework files are deliberately excluded
from Git; a fresh checkout must prepare them before installing. Remove the local
overrides when adopting a compatible published release.

If Corepack is not available, install the pinned pnpm version with
`npm install -g pnpm@10.34.6`.

## Add an application

Run the official scaffold from the repository root:

```sh
pnpm create embody-app apps/my-app
pnpm install
pnpm --filter './apps/my-app' dev
```

Use a unique package name such as `@embody-apps/my-app` in the new app's
`package.json`. Keep its scaffolded scripts and Embody configuration; do not
create a nested workspace or commit app-local lockfiles. Install dependencies
from the repository root so all apps share `pnpm-lock.yaml`.

Apps can extend `../../tsconfig.base.json` in their own `tsconfig.json`, keeping
any app-specific compiler options, includes, and output paths from the scaffold.
The shared config is optional; preserve framework-required settings.

## Workspace commands

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm check
pnpm dev:gateway

# Run a command for one application:
pnpm --filter './apps/my-app' test
pnpm --filter './apps/my-app' dev
```

Root commands run the matching scripts in workspace packages that define them.
`dev:gateway` starts one authenticated loopback gateway on port 3032, Kanban on
3031 and CRM on 3033, each with its existing database. Stop standalone app hosts
before starting it. The existing Codex adapter at
`apps/kanban/scripts/codex-mcp.mjs` now connects to the shared `/mcp` endpoint:
`kanban__tracker_get_board` and `crm__workspace_get_workbench` are available through
the same MCP connection. Its current Codex configuration may still call the server
`kanban`; that label does not restrict the catalog. Reconnect that server after a
gateway restart to reload credentials and tool discovery. An Apps-capable client
can read both apps' GenUI resources; native desktop rendering depends on the
client's negotiated capabilities. The widgets use shared-endpoint tool names.

`pnpm check` also runs the multi-app gateway integration test after the app builds;
it verifies authenticated discovery, calls, GenUI resources and MCP attribution
against disposable databases. Run it alone with
`pnpm --filter @embody-apps/kanban test:gateway`.

Kanban defines all three scripts and executes real integration tests. Development
servers are started individually so applications can use separate ports.

## Shared packages

Put shared code in `packages/<name>` with its own private ESM `package.json`,
unique name, exports, and appropriate build/typecheck/test scripts. Reference
it from an app with the `workspace:*` protocol:

```sh
pnpm --filter './apps/my-app' add '@embody-apps/shared@workspace:*'
```

Prefer cohesive domain plugins over a single global application. Keep business
invariants in Embody hooks and actions, and test through `@embody/testing`.

## Local configuration

Keep secrets in each app's ignored `.env` files and commit only secret-free
`.env.example` files. Use distinct ports and database paths for each app. Local
Embody inspector endpoints must remain loopback-only.
