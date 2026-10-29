# Kanban

A persistent multi-project task tracker built with Embody, with an experimental app-owned GenUI board. Agents track work here; the app does not start or orchestrate agents.

## Run locally

From the repository root, using Node.js 22 or 24:

```sh
pnpm install
pnpm --filter './apps/kanban' dev
```

First prepare the unpublished official GenUI candidate as described in the
[workspace setup](../../README.md#setup). The build bundles a static MCP Apps
resource; task data is supplied separately through the ordinary action result.

## GenUI board

The board uses the reusable [`codexTheme`](../../packages/codex-theme/README.md)
presentation plugin from `@embody-apps/codex-theme`. It adds Codex-inspired system
typography, neutral cards and controls, subtle borders, responsive columns, and
host-aware light/dark styling. The app applies it once with
`resource: codexTheme.apply({ text: trustedBuiltHtml })` before resource integrity
is computed. No per-app stylesheet or extra browser launcher is required.

`tracker.getBoard({projectId?, offset?, limit?})` reads an organization-scoped task
page (default 20, maximum 50), optionally filtered to a project. Its ordinary JSON
output and registered view share the same Zod schema. `defineGenUi`, `defineView`
and `withGenUi` bind the action to `ui://kanban/board@1.2.0`; there is no `defineUI`
API in this candidate.

The board groups the current page into To do, In progress, Done and Canceled,
showing completion criteria, dependency IDs, parent/project IDs and cancellation
reasons in expandable **Task details**. Cards keep the title and status controls
visible. Columns stay in one horizontally scrollable row sized to the embedded
panel, with no page-wide overflow. Dragging near either board edge scrolls to
offscreen statuses. Dependency IDs may already be resolved or outside the current page.
Refresh and pagination use authenticated ordinary reads. Drag a card into another
status column to save its move, or use **Move to → Save status** with a keyboard or
touchscreen. Canceling requires a reason before anything is saved. Reopening clears
the cancellation field while preserving the existing caller-attributed history.
Cards move after the server confirms and the board refreshes; rejected/uncertain
operations do not pretend to have succeeded. One card draft is editable at a time;
refresh offers explicit draft discard. Long display text is explicitly truncated
without changing stored data.

`tracker.moveTask({id, status, expectedStatus, cancellationReason?})` runs through
ordinary authenticated execution and task hooks. The last-read status must match
the stored status. This check is not a complete revision-based concurrency contract
and does not detect changes that leave the status unchanged. Dragging uses the same
declared GenUI form and payload validation as the accessible controls. The initial
page refresh pins the controller to the current project/page before editing.

The dedicated browser regression uses disposable SQLite data, the official Apps
bridge in an opaque iframe, and installed Chrome (or `CHROME_PATH`):

```sh
pnpm --filter './apps/kanban' test:browser
```

It verifies drag/drop persistence, selected moves, cancellation, reopening history,
project-scoped refresh, rejected drafts and explicit discard. It also checks 360px,
680px and desktop layouts, keyboard-accessible details, and edge scrolling during
dragging in both directions. Touch users have the
status controls; HTML drag support depends on the browser/host. Existing open views
must be reopened after a resource version change.

Compatible MCP Apps hosts discover the action presentation and its static resource
through the authenticated gateway. No separate browser launcher is needed. Plain
clients continue to receive ordinary task JSON; the app's document builder also
supports the official deterministic text renderer.

The current framework candidate registers GenUI on the app configuration, not on
plugins, and requires an app-owned static resource. Consequently this integration
still has a presentation builder, browser resource entrypoint and build step.

`src/presentation.ts` validates board data and composes reusable GenUI nodes from
`src/presentation/components/`: task details, task status form, task card, status
column, and board pagination. Shared board types and status ordering live in
`src/presentation/model.ts`; payload bindings live in `src/presentation/bindings.ts`.
The browser entrypoint and drag enhancement use the same document and action IDs.

Plugin-only declarative UI authoring is not supported by this framework API;
providing it requires a framework change rather than app-specific launch scripts.

### Codex connection

With `dev:gateway` running, register the transparent MCP transport using a supported
absolute Node executable path:

```sh
codex mcp add kanban -- /absolute/path/to/node /absolute/path/to/embody-apps/apps/kanban/scripts/codex-mcp.mjs
```

The adapter reads the rotating app-local credential file when it starts. Credentials
are not saved in Codex configuration. Unlike this candidate's tools-only Embody CLI
bridge, it forwards initialization and resources unchanged. Restart/reconnect the
Codex MCP server after restarting the gateway. The adapter connects to the shared
`/mcp` endpoint for both Kanban and CRM. Tool names include
`kanban__tracker_get_board` and `crm__workspace_get_workbench`; both widgets use
these shared-endpoint names. The ignored `.embody/codex-mcp-observation.json` records
only client capabilities and protocol method names for diagnostics.

On 2026-10-25, Codex CLI/backend `0.162.0-alpha.17.2` successfully discovered all 18
Kanban tools through this connection. Its status/discovery connection advertised
elicitation, but no `io.modelcontextprotocol/ui` extension; Embody consequently
returned no UI resources or presentation metadata. Temporary tests with
`enable_mcp_apps` and `mcp_2026_07_28` did not change that discovery handshake.
The installed protocol includes MCP Apps presentation fields, but that alone does
not prove desktop rendering. The running desktop control socket was unavailable,
and automated access to the Codex UI was blocked. A desktop reconnect and native
`tracker_get_board` invocation are still required; interactive chat UI is unverified.

Health: `http://127.0.0.1:3031/health`  
Development discovery: `http://127.0.0.1:3031/__inspector/manifest`

The official Embody development inspector binds only to loopback. **Do not expose it remotely.** `dev` builds and loads the compiled config because the scaffold's native Node loader does not resolve `.js` imports to TypeScript source. Restart after source changes. Stop with Ctrl-C.

Data lives in `apps/kanban/.embody/kanban.sqlite` and survives restart. A separate conventional host (without the CLI inspector) runs with:

```sh
pnpm --filter './apps/kanban' start
```

`start` loads an optional app-local `.env` and defaults to the same port/database. Do not run both hosts against that database simultaneously. See `.env.example` for secret-free variable names.

## Implemented

- Projects; tasks with definitions of done, optional nested subtasks, and ID-based blockers.
- `todo`, `in_progress`, `done`, `canceled`; explicit state changes with no completion cascade or blocker/child gates.
- Same-project/org references, immutable project membership, unique blockers, cycle prevention, restrictive owner-only deletion.
- Append-only, caller-attributed comments. Cancellation/reason edits and reopening preserve attributed decision history transactionally.
- `tracker.addComment` and bounded `tracker.getTaskContext`, plus generated entity CRUD/list operations subject to hooks and scopes.
- Stable chronological comment pagination using a server-owned per-task ordering key.

A canceled blocker **remains unresolved**. Only `done` resolves it; removing a dependency is an explicit update. Reopening canceled tasks requires `cancellationReason: null`. Add an explanatory comment when changing the decision; the automatic history preserves the prior reason.

## Use Embody's interfaces

Inspect schemas before calling targets. Kernel/inspector targets are `tracker.project.create`, `tracker.task.update`, `tracker.addComment`, etc. Payloads and workflows are in [the plan](docs/plan.md).

The local inspector can execute them for development using its existing Embody endpoint, for example:

```sh
curl -fsS http://127.0.0.1:3031/__inspector/execute \
  -H 'Content-Type: application/json' \
  -d '{"target":"tracker.project.create","input":{"data":{"name":"My project"}}}'
```

Use the returned `id` in task `projectId`. Generated list operations accept `filter`, `limit` (1–100), and `offset`. Read comments with `filter: {taskId: "<task-id>"}` and the default ascending sort.

`getTaskContext` accepts `{taskId, childrenOffset?, childrenLimit?}` and returns the task, project, all blocker records, `unresolvedBlockerIds`, `isBlocked`, a direct-child page, `childrenTruncated`, and nullable `nextChildrenOffset`. Default child limit is 20; maximum is 100. Comments are a separate paginated read, not embedded recursively.

### Local authenticated gateway and CLI

Stop `dev` or `start` first, then run from the repository root:

```sh
pnpm dev:gateway
```

This starts the official Embody Gateway on loopback port **3032**, JWT-authenticated Kanban on **3031**, and CRM on **3033**, with their existing separate SQLite databases and no inspector routes. Disposable human-owner credentials are generated into the ignored, mode-0600 `apps/kanban/.embody/dev-cli.env`; they rotate on every restart. In another terminal:

```sh
cd apps/kanban
source .embody/dev-cli.env
pnpm exec embody apps list
pnpm exec embody apps inspect kanban
pnpm exec embody kanban task list --output json
```

Do not share this owner credential or expose either listener remotely. Owner credentials do not bypass relationship or append-only history policies.

The shared-gateway integration test verifies MCP discovery, reads and GenUI resources for both apps, as well as agent attribution of CRM writes. Remote deployment and production remain unverified. App-scoped MCP endpoints remain available for ordinary calls; the current widgets target shared-endpoint tool names.

## Limits and verification

SQLite only; maximum 1000 tasks/project and 100 blockers/task. Overlapping SQLite requests can fail rather than queue. Read-modify-write blocker edits are not compare-and-swap. PostgreSQL production isolation is unverified and `start` refuses `DATABASE_URL`.

```sh
pnpm check
```

23 integration/runtime tests cover schema/defaults, partial-update preservation, tenant/project isolation, paginated relationships, cycles beyond 100 records, concurrent conflicting edits, deletion, blockers, authorship, permissions, rollback, context bounds, host health/discovery, restart and offline backup restore, plus GenUI board pagination, safe text output, resource metadata, host discovery and persisted moves. The separate browser regression covers the interactive journey.

- [Specification and implementation decisions](docs/plan.md)
- [Installed framework contracts and blockers](docs/framework-contracts.md)
- [Commands, results and requirement-to-test evidence](docs/verification.md)
- [Local operations and future deployment checklist](docs/operations.md)
