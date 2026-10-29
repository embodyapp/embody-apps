# CRM for selling Embody app hosting

## What we are trying to do

Turn a real app need into a paying, successfully hosted app, and retain the relationship long enough to earn renewal or expansion. The CRM is the shared memory and next-action system for that process. It must answer: who is buying, what are they trying to run, why would they pay us, what evidence do we have, who does what next, and did the customer reach value?

Start with founder-led sales, one selling organization, and both humans and agents working in it. Embody organization isolation separates sellers; an account is a seller's customer, not a platform tenant. Prices, packages, trial duration, billing provider and hosting infrastructure are deliberately unassumed. Record actual commercial terms in minor currency units; never invent a price list.

## Sales motion

1. Capture the company, contact, source and concrete app use case. A developer, founder, agency and internal platform team can buy for different reasons; record the situation rather than impose a lead score.
2. Discover the workload: existing app or new build, business outcome, technical owner, buyer, integrations, data sensitivity, preferred region and deployment blockers. Self-hosting may be the right outcome; record why managed hosting matters (operations, reliability, access, support).
3. Evaluate against one explicit success criterion with customer evidence. A demo is an activity, not proof of value.
4. Propose a hosting scope and recurring amount with currency, including runtime needs and agreed region. Store references to terms, not secrets or deployment credentials.
5. Record the accepted agreement and decision maker. A won sale means accepted commercial intent; it does not mean payment collected, infrastructure ready or recurring revenue recognized.
6. Hand off to onboarding: technical access, deployment, first useful agent action, then a customer-confirmed outcome. Maintain a next step until reported live.
7. Later reconcile subscriptions and hosting telemetry, surface renewal risks, and create a separate expansion opportunity for another app or increased scope.

One account can have many contacts, opportunities and hosted apps. One opportunity represents one buying decision for a hosting scope. Keep its commercial snapshot when it closes. Follow-up is part of the opportunity rather than an unrelated task system. Activity is append-only customer context, attributed by the server. Do not build a second Kanban app here.

## Plugin boundaries

| Plugin | Owns | Public behavior | Depends on |
| --- | --- | --- | --- |
| `relationships` | Accounts, contacts, attributed account activity | Capture relationship context; enforce contact/account links | None |
| `sales` | Hosting opportunities, stage evidence, terms and next action | Move stage with expected current stage; emit `sales.opportunity.won` transactionally | Relationships reference contract |
| `success` | One onboarding engagement per won opportunity; launch and first-value evidence | Consume won event idempotently; track handoff and customer outcome | Sales read contract |
| `workspace` | No business records; bounded read projections | Sales workbench and account context for people and agents | Read contracts of all three domains |
| `billing` (later) | External customer/subscription IDs, verified lifecycle mirror | Reconcile signed provider events; report collected recurring revenue | Account identity; provider adapter |
| `hosting` (later) | External app/environment IDs, observed readiness | Read actual provisioning state; request provisioning with an idempotency key | Hosting control-plane adapter |
| `communications` (later) | Delivery requests, consent and delivery outcomes | Explicitly authorized outreach via outbox, provider deduplication | Relationship IDs; mail/calendar adapters |

Keep v1 plugins inside this app. Extract to `packages/*` only with a second real consumer. Each domain exports its schemas and a narrow read accessor contract. Cross-domain reads use kernel entity accessors, preserving organization scoping. Cross-domain mutations remain with the owning plugin; success subscribes to a durable event, rather than sales writing its tables. The workspace projection never becomes the place for business rules.

## Persisted rules

- Contacts and opportunities must reference an existing account in the same organization. The decision contact must belong to that account. An account association cannot be reassigned under existing history.
- New opportunities start in discovery. Open opportunities need an owner and dated next action. Evaluation needs a success criterion; proposal needs scope, region and positive proposed monthly amount; won needs evaluation evidence, a decision contact and accepted-terms reference. Lost needs a reason. Terminal records cannot be reopened in v1; a new buying decision gets a new opportunity.
- Hooks enforce those rules for generated CRUD as well as custom actions. Update schemas must preserve omitted fields and must not reset defaults.
- Won events are committed with the transition. Onboarding creation is eventual and idempotent by opportunity ID. Creating it requires a persisted won opportunity. Its account is derived, not trusted from an event payload.
- Onboarding starts pending; reported-live requires a hosted app URL and first-value evidence. It records a customer-success assertion, not verified platform health. Live records retain those required fields on later edits.
- Activities are append-only and caller attributed. Accounts and linked business records use archival/closed status rather than hard deletion in v1.
- No CRM action charges a card, sends outreach, changes permissions or provisions infrastructure. Future adapters must verify their own evidence and use stable idempotency keys. A supplied boolean is never payment or approval proof.

## GenUI surfaces

| Surface | Actual components | Job |
| --- | --- | --- |
| Sales workbench (v1) | Stage filter, five vertical summary cards, next-step/due facts, pagination actions | Scan customer follow-ups and choose one opportunity |
| Opportunity detail (v1) | Back action, owner/next step, hosting/evaluation/terms sections, stage form | Inspect and update one opportunity while preserving the list context |
| Account context (v1) | View selector for contacts, opportunities, activity or onboarding; one paged list at a time | Give a person or agent focused relationship context before a conversation |
| Capture composer (next) | Account/contact fields, use-case field, owner and next-step/date inputs, duplicate suggestions | Capture a lead in one atomic action instead of several manual creates |
| Evidence editors (next) | Discovery inputs, evaluation checklist, terms editor | Collect missing stage evidence where it is needed |
| Launch desk (next) | Onboarding checklist, blocker callout, hosting status badge, evidence links | Separate sales completion from actual delivery and first value |
| Revenue/retention (after adapters) | Currency-separated metrics, verified subscription status, renewal queue | Act on real payment and usage data |

Use the installed standard GenUI document primitives, not imaginary table/chart/board framework APIs. Cards are app composition of sections. Design for 320–560px-wide chat: one vertical column, compact summaries, progressive detail and 44px touch targets. See [layout principles](../../../docs/genui-design.md). Every interactive control calls an ordinary authorized action; it has a declared effect, explicit payload binding and authoritative refresh. No business data is baked into HTML. JSON remains fully usable without GenUI.

Do not sum currencies, label proposed amounts as MRR, or treat a paginated slice as a complete pipeline. The first workbench labels its bounds and shows proposed amounts per opportunity. Evidence input and full CRUD are available to agents through the same schemas even before specialized editors exist.

## What to measure, after there is real data

- Open opportunities without an upcoming next action; overdue actions; time in stage.
- Evaluation-to-agreement conversion and loss reasons by use case and source.
- Agreement-to-first-value time and onboarding blockers.
- Collected recurring revenue, retention, expansion and failed payment only after billing reconciliation.
- Hosting activation and meaningful usage only after telemetry integration.

Do not start with configurable funnels, arbitrary custom fields, campaign automation, predictive scores, email scraping or a dashboard of invented metrics. Use actual sales conversations to decide which fields and integrations earn their cost.

## Delivery scope

This implementation establishes three domain plugins and one projection plugin, a local SQLite app, stage and reference guardrails, an event-driven onboarding handoff, two GenUI read surfaces, a workbench stage form, and kernel integration tests. It is an operational local foundation. Billing, provisioning, messaging, import/deduplication, reminders, a browser capture flow and production deployment are subsequent work, with no live accounts connected or customer records imported.
