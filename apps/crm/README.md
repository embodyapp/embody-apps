# Embody hosting CRM

A local, agent-native CRM for selling managed Embody app hosting: customer relationships → app use case → evaluation → agreement → onboarding → first value.

Read the [product and plugin plan](docs/plan.md) for the first-principles model, domain boundaries, GenUI components, deferred integrations and measurement strategy.

## Run

From the repository root, with Node 22 or 24 and the pinned pnpm version:

```sh
pnpm install
pnpm --filter @embody-apps/crm dev
```

The local inspector listens at `http://127.0.0.1:3033/__inspector`; SQLite lives at `apps/crm/.embody/crm.sqlite`. Port 3033 avoids the existing Kanban app and gateway. Use `pnpm --filter @embody-apps/crm start` for the built app host. This app uses the workspace's prepared local Embody packages; see the root setup instructions for a fresh checkout.

The GenUI resource is a result-attached MCP App, not a standalone website. For the shared Kanban + CRM MCP connection, stop standalone `dev` first and run `pnpm dev:gateway` from the repository root. The gateway listens on 3032 and manages authenticated app hosts on 3031 and 3033. The existing Codex adapter now connects to `/mcp` for both apps; reconnect it to discover `crm__workspace_get_workbench`. GenUI requires a client that negotiates MCP Apps support. Its buttons use the shared endpoint's prefixed tool names. No production gateway is configured and no site is published.

## Plugins

| Plugin | Records / actions |
| --- | --- |
| `relationships` | Account, contact, append-only caller-attributed activity |
| `sales` | Opportunity, evidence and commercial snapshot; `moveStage` |
| `success` | Onboarding engagement; idempotent won-event handoff |
| `workspace` | `getWorkbench`: bounded sales view, optionally account context |

Schemas and the client presentation contract live in `src/schemas.ts`. Plugins own their hooks and mutations; read accessors preserve kernel organization scoping. Projection access is authorized at `workspace.getWorkbench`; grant it only to principals permitted to read the relationship, sales and success context it exposes. Authentication configuration and gateway scopes remain deployment responsibilities.

## Use through actions

Targets below are kernel/inspector targets; a gateway prefixes them with `crm.`.

1. `relationships.account.create` with `{ data: { name, source } }`.
2. `relationships.contact.create` with `{ data: { accountId, name, email, role } }`.
3. `sales.opportunity.create` with `{ data: { accountId, title, useCase, ownerId, currency, nextAction, nextActionAt } }`. Dates use ISO timestamps with an offset; currency is an uppercase three-letter code. Amounts use that currency's minor unit.
4. Use `sales.opportunity.update` with `{ id, data }` to record discovery and evaluation facts. Omitted fields stay unchanged.
5. `sales.moveStage` with `{ id, expectedStage, stage }`. Evaluation requires `evaluationGoal`; proposal also requires `hostingScope`, `region` and positive `proposedMonthlyMinor`.
6. Winning additionally requires a same-account `decisionContactId` and `evaluationEvidence`, plus `acceptedTermsReference` in the move request. Losing requires `lossReason`. Closed opportunities are immutable snapshots; new sales decisions get new records.
7. The outbox creates one pending onboarding engagement per won opportunity. Update it through `success.engagement.update`; blocked needs `blocker`, and live needs `hostedAppUrl` and `firstValueEvidence`. This is a reported customer outcome, not a provisioning or payment verification.
8. Read `workspace.getWorkbench` with `{}` for five compact cards, or `{ stage, accountId, limit, offset }` to filter and page. `opportunityId` opens one opportunity. On an account, `panel` selects `opportunities`, `contacts`, `activity` or `onboarding`; pagination applies to that selected panel. Stage filtering happens at the server. GenUI uses a single vertical column with touch-sized controls; stage forms and evidence appear only in the selected opportunity's detail view. Long presentation text is abbreviated; ordinary record reads retain the full data.

Account/contact capture, evidence editing, logging activity and onboarding edits currently use ordinary actions. Dedicated GenUI editors for these are planned. The built-in runtime refresh initially reads the general workbench; a filter or navigation control explicitly binds its account/page/detail context, after which action reconciliation preserves it.

The [chat layout principles](../../docs/genui-design.md) explain the mobile design and navigation flow. Open a card to bind its detail context before editing its stage. Back navigation preserves the previous filter and page. `pnpm --filter @embody-apps/kanban test:browser` exercises the compiled CRM widget at chat widths as well as the existing Kanban browser flows.

## Verify

```sh
pnpm --filter @embody-apps/crm typecheck
pnpm --filter @embody-apps/crm test
pnpm check
```

Integration tests cover stage gates through both custom actions and generated CRUD, preserved update fields, reference and tenant integrity, caller attribution, stale changes, transaction/outbox rollback, duplicate onboarding delivery, launch evidence, pagination, GenUI payloads and reconciliation, bounded presentation, host discovery and resource integrity. Host tests need permission to bind loopback.

Billing, actual provisioning, automated outreach, imports, account deduplication, scheduled follow-ups and production deployment are not connected. The application contains no customer seed data or live integrations. Do not expose the development inspector publicly.
