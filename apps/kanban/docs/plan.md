# Headless Kanban app: plan and usage

## 1. Purpose and scope

Build a persistent, agent-first task tracker with Embody. The app organizes work across multiple projects and records progress, dependencies, completion criteria, verification work, comments, and cancellation decisions.

This is a task-record system, not an agent orchestrator. Agents perform work elsewhere and use this app to read and update its state.

**Document status:** local SQLite implementation exists. See [verification](verification.md) for observed checks and [framework contracts](framework-contracts.md) for installed APIs and remaining blockers. This document retains the original full acceptance contract: passing local tests does not imply gateway/production phases are complete. Kernel target names and action payloads below are implemented; remote CLI/MCP examples remain deployment proposals.

### Confirmed requirements

- Headless: no UI or drag-and-drop board.
- One human user initially, with possible team members later.
- Multiple projects.
- Agents can read, comment on, and update tasks.
- Tasks have IDs and reference blockers by task ID.
- Statuses: `todo`, `in_progress`, `done`, and `canceled`.
- Every task has a definition of done.
- Tasks can optionally have subtasks, including tests needed to prove completion.
- Canceled tasks remain available to record decisions.
- Canceling a blocker does **not** resolve the dependency. An agent must explicitly remove the dependency if it is no longer required.
- Use Embody's agent-facing surfaces rather than building separate custom CLI, HTTP, or MCP implementations.

### Proposed v1 defaults

These are recommended design choices, not additional user-confirmed requirements:

- One cohesive task-tracking plugin.
- Subtasks are regular tasks linked by `parentTaskId`, with nesting allowed.
- Dependencies and parent relationships stay within one project.
- Unresolved blockers are informational, not hard status-transition gates.
- A parent is not automatically completed or canceled when its children change.
- A nonempty cancellation reason is required for canceled tasks.
- Comments are append-only and their authorship is derived from the caller.
- Tasks are normally canceled rather than deleted.
- No assignment, priority, labels, custom statuses, or custom team-role system in v1.

### Explicit non-goals

- Starting agents, scheduling work, claiming queues, execution leases, or monitoring agent processes.
- Automatic code execution or verification of submitted test evidence.
- Notifications, external integrations, and durable workflows without a concrete need.
- A custom transport or authentication system inside the business plugin.

## 2. Architecture

### Planned workspace location

```text
apps/kanban/                  Kanban project (documentation only for now)
  README.md                  Project overview
  docs/plan.md               This specification
  embody.config.ts           Future scaffolded application configuration
  ...                        Future plugin and test layout from the scaffold
```

Proposed identifiers:

- Package: `@embody-apps/kanban` (private, ESM).
- Application ID: `kanban`.
- Plugin ID: `tracker`.
- Entities: `project`, `task`, `comment`.

Preserve the official scaffold's actual APIs, file layout, and configuration. Do not implement against speculative framework methods.

### Embody responsibilities

- Persist entity records.
- Generate entity operations and expose discoverable schemas and descriptions.
- Execute typed actions and lifecycle hooks.
- Carry authenticated principal identity and organization scope.
- Provide agent access through compatible gateway CLI and MCP surfaces.

### Application responsibilities

- Define the three business schemas.
- Enforce valid references and dependency/hierarchy rules.
- Attribute comments to authenticated callers.
- Describe operations clearly enough for agents to use safely.
- Provide task-context reads where multiple raw entity reads would be cumbersome.

A managed or self-hosted Embody Gateway is a deployment choice, not a dependency embedded in the business model. The local host inspector is development-only and must remain loopback-only; it is not a production authentication boundary.

## 3. Object schemas

### Common record envelope

Embody supplies an entity record envelope containing:

| Field | Meaning |
| --- | --- |
| `id` | Framework-generated record ID; referenced by relationships |
| `orgId` | Organization/tenant boundary |
| `entityType` | Framework entity identity |
| `createdAt` | Creation timestamp |
| `updatedAt` | Last update timestamp |
| `data` | Business fields defined below |

Do not duplicate these fields inside `data`. In particular, each task already has an ID; no separate task-number sequence is required for v1.

Use UUID validation for relationship IDs if the installed version confirms UUID entity identifiers, as shown in the Embody reference. Confirm exact record types before implementation.

### Project data

| Field | Type | Required/default | Constraints |
| --- | --- | --- | --- |
| `name` | string | Required | Trimmed, nonempty |
| `description` | string | Default `""` | Context for the project |

Project names need not be unique in v1. IDs disambiguate them. All tasks belong to exactly one project.

### Task data

| Field | Type | Required/default | Constraints |
| --- | --- | --- | --- |
| `projectId` | UUID | Required | Existing project visible within the caller's organization |
| `parentTaskId` | UUID or null | Default `null` | Existing task in the same project; no hierarchy cycles |
| `title` | string | Required | Trimmed, nonempty |
| `description` | string | Default `""` | Scope, context, links, and implementation notes |
| `definitionOfDone` | string | Required | Trimmed, nonempty; explicit completion criteria |
| `status` | enum | Default `todo` | `todo`, `in_progress`, `done`, `canceled` |
| `blockerIds` | UUID[] | Default `[]` | Unique existing task IDs in the same project |
| `cancellationReason` | string or null | Default `null` | Nonempty when canceled; proposed null for other statuses |

`definitionOfDone` is plain text that can contain Markdown checklists. It states the result that must be achieved; subtasks track the steps and evidence used to achieve it.

A subtask has the **same required fields and behavior** as any other task, including its own definition of done, status, blockers, and comments.

There is no stored `subtaskIds` array. Children are discovered by querying tasks whose `parentTaskId` matches the parent ID. This avoids maintaining two copies of the same relationship.

### Comment data

| Field | Type | Required/default | Constraints |
| --- | --- | --- | --- |
| `taskId` | UUID | Required | Existing task in the caller's organization |
| `body` | string | Required | Trimmed, nonempty; discussion, decisions, or evidence |
| `authorId` | string | Server supplied | Derived from `principal.actorId` |
| `authorType` | enum | Server supplied | Derived from `principal.actorType`: `human`, `agent`, `system` |

Comments are separate records so concurrent agents can append without replacing a task's entire comment list. Read comments with pagination and chronological sorting.

Proposed v1 policy: comments are immutable and cannot be deleted by normal agent credentials. Correct a mistaken comment with a follow-up comment. Record timestamps come from the envelope.

Do not accept trusted authorship fields from an agent. Implement `addComment` with server-derived authorship and enforce the same rule at any generated create boundary that remains accessible. Deny generated comment update/delete targets to normal clients, with hooks as appropriate to prevent bypasses.

## 4. Status, dependency, and hierarchy semantics

### Status meanings

| Status | Meaning |
| --- | --- |
| `todo` | Work has not started |
| `in_progress` | Work has started |
| `done` | Caller asserts the definition of done has been met |
| `canceled` | Work will not be completed under the current decision |

Proposed default: allow explicit transitions between these statuses, including reopening done or canceled tasks. No automatic transitions.

When reopening a canceled task, clear `cancellationReason` and add a comment explaining the changed decision. The prior cancellation reason should be preserved in a server-created decision comment, so reopening does not erase the rationale. Implement cancellation/reopening changes and their decision comments transactionally, including changes made through generated task updates.

A transition into `canceled`, or an edit to its cancellation reason while canceled, should capture that reason in an attributed comment. This is narrowly scoped decision history, not a complete mutation audit log.

### Blocker direction

If B has `blockerIds: [A.id]`, **A blocks B**.

- A blocker is resolved only when its status is `done`.
- `todo`, `in_progress`, and `canceled` blockers are unresolved.
- Keep completed blocker IDs in the array; they record the dependency relationship.
- Reopening a completed blocker makes that dependency unresolved again.
- Canceling a blocker does not remove references to it or unblock dependents.
- Removing a dependency is an explicit task update. Agents should comment on why it was removed.

Compute current blocker state from referenced records; do not persist an `isBlocked` boolean. A task-context response may include `unresolvedBlockerIds` and a derived `isBlocked` value.

**Proposed, still to confirm:** blocker state is informational. A blocked task can enter `in_progress` or `done`, with the caller responsible for explaining why. This supports partial work and avoids introducing an unrequested workflow engine. If strict enforcement is desired later, define the policy explicitly and enforce it server-side.

### Dependency invariants

- Every blocker exists and belongs to the same project and organization.
- No self-blocking or duplicate IDs.
- No cycles in the blocker graph, including indirect cycles.
- A parent/child relationship does not itself imply a blocker relationship.

### Parent/subtask invariants

- Parent and child belong to the same project and organization.
- No self-parenting or indirect hierarchy cycles.
- Reparenting is permitted when the resulting hierarchy is valid.
- Completion or cancellation does not cascade between parent and children.

**Proposed, still to confirm:** unfinished subtasks do not mechanically prevent parent completion. Agents should inspect child states and explain any exceptions. If subtasks are intended as mandatory completion gates, decide how canceled children count before implementing that rule.

### Project changes and deletion

Recommended v1 simplification: make a task's `projectId` immutable after creation. Cross-project moves can become a dedicated atomic action later.

If project changes are supported instead, validate both outgoing and incoming dependency and hierarchy relationships; checking only the edited task is insufficient.

Recommended deletion policy:

- Prefer cancellation for tasks so decisions remain visible.
- Reject task deletion if it has child tasks, comments, or incoming blocker references.
- Reject project deletion while it contains any tasks, including canceled tasks.
- Do not cascade-delete or silently remove blocker references.
- Restrict destructive operations to explicit owner scopes; normal agent scopes do not need them.

## 5. Agent-facing operations

Use generated entity operations when they suffice. Add custom actions only for cohesive business operations or useful read composition.

### Planned generated operations

| Entity | Operations for normal use |
| --- | --- |
| `project` | Create, get, list, update |
| `task` | Create, get, list, update |
| `comment` | Get, list; creation through `addComment` |

Generated operations remain subject to scope authorization and lifecycle invariants. Do not assume that using a custom action alone protects the corresponding entity operation.

### Proposed custom actions

| Action | Input | Behavior |
| --- | --- | --- |
| `addComment` | `{ taskId, body }` | Validate task, derive caller authorship, create comment, return comment record |
| `getTaskContext` | `{ taskId }` | Return task, project, blocker records, derived unresolved blockers, and direct-subtask summary |

Keep comments and potentially large child lists paginated through list operations; do not return an unbounded recursive task tree or full comment history from `getTaskContext`. Define bounded context output and truncation/pagination behavior during implementation.

Use generated task updates to change status, details, parents, or blockers. Entity hooks must apply rules and transactional cancellation history consistently regardless of transport.

### Query patterns and planned indexes

| Entity | Query patterns | Candidate indexes |
| --- | --- | --- |
| `task` | Tasks in project; tasks by status; children of a task | `projectId`, `status`, `parentTaskId` |
| `comment` | Comments for a task | `taskId` |
| `project` | Browse projects | No additional business-field index initially |

Confirm supported filtering, sorting, pagination, and index semantics in installed declarations. Do not assume a `blockerIds` array index exists. Reverse-dependency checks and graph traversal may need project-scoped scans for v1, with pagination and explicit workload bounds rather than silently checking only one page.

## 6. Usage guide

### Discover before mutating

After gateway deployment and credential provisioning, configure `EMBODY_GATEWAY_URL` and `EMBODY_TOKEN` securely. Never put actual tokens in committed examples.

```sh
npx -y @embody/cli apps list
npx -y @embody/cli apps inspect kanban
```

Prefer JSON output for automation using flags supported by the installed CLI. Inspect generated schemas before calling actions rather than guessing command options.

An agent's MCP client can use the app-scoped gateway endpoint `/mcp/kanban`. Gateway scopes determine which operations it can discover and invoke.

Proposed target naming, based on Embody's conventions:

```text
Kernel/test target: tracker.task.update
Deployed target:   kanban.tracker.task.update
MCP tool:          kanban_tracker_task_update
```

These names depend on the final app/plugin IDs and must be verified through discovery after scaffolding.

### Action payload examples

The following JSON objects show intended action inputs, not a standalone HTTP API or guaranteed CLI syntax. Angle-bracket IDs are placeholders to replace with returned record IDs.

Create a project using its generated create operation:

```json
{
  "data": {
    "name": "Task tracker",
    "description": "Build the headless multi-project task system"
  }
}
```

Create a parent task:

```json
{
  "data": {
    "projectId": "<project-id>",
    "title": "Support project-scoped task listing",
    "description": "Agents must be able to retrieve work for one project.",
    "definitionOfDone": "Project filtering returns only matching tasks; integration tests prove isolation and empty-project behavior."
  }
}
```

Create a verification subtask:

```json
{
  "data": {
    "projectId": "<project-id>",
    "parentTaskId": "<parent-task-id>",
    "title": "Test project filtering isolation",
    "definitionOfDone": "An integration test creates tasks in two projects and proves listing one project never returns tasks from the other."
  }
}
```

Set dependencies using the generated update operation:

```json
{
  "id": "<verification-task-id>",
  "data": {
    "blockerIds": ["<implementation-task-id>"]
  }
}
```

This array replaces the blocker list; it is not an append operation. Read the current task before editing it. Re-read afterward when coordinating multiple agents.

Move a task into progress:

```json
{
  "id": "<task-id>",
  "data": { "status": "in_progress" }
}
```

Add evidence using the proposed `addComment` action:

```json
{
  "taskId": "<verification-task-id>",
  "body": "Added project-isolation.test.ts. The targeted test suite passes. Both project isolation and an empty result set are covered."
}
```

Record only evidence actually observed. A successful status update does not mean the app independently executed or verified tests.

Complete the verification task:

```json
{
  "id": "<verification-task-id>",
  "data": { "status": "done" }
}
```

Cancel a task with rationale:

```json
{
  "id": "<task-id>",
  "data": {
    "status": "canceled",
    "cancellationReason": "Superseded by the shared filtering implementation; separate work is no longer needed."
  }
}
```

Under the proposed decision-history policy, the server also records this rationale as an attributed comment in the same transaction.

### Typical agent workflow

1. Discover the available schemas and operations.
2. Find the project and task; read the definition of done and recent comments.
3. Inspect blockers and direct subtasks before deciding what work is ready.
4. Create subtasks for meaningful implementation and verification steps as needed.
5. Set `in_progress` when starting work; perform the work outside the app.
6. Comment with results, evidence, unresolved questions, or decisions.
7. Mark completed subtasks `done` after their criteria are met.
8. Review the parent's definition of done and child states before marking it `done`.
9. If work is abandoned, cancel it with a specific reason rather than deleting it.

### When a blocker is canceled

Suppose B depends on A, and A is canceled:

1. B remains dependent on A and its blocker remains unresolved.
2. Read A's cancellation rationale.
3. Decide whether B still requires that work, needs a replacement dependency, or should itself be canceled.
4. If the dependency is unnecessary, explicitly remove A from B's `blockerIds` and comment with the reasoning.
5. Do not mark A `done` just to unblock B.

### Multi-agent cautions

This app is not a work-claiming service. Two agents may work on the same task unless they coordinate externally.

Do not assume generated updates offer optimistic concurrency, revision checks, or compare-and-swap. Confirm installed support before promising those guarantees. Read-modify-write updates to `blockerIds` can overwrite a concurrent edit; if this becomes common, introduce verified atomic add/remove dependency actions or supported concurrency controls.

Do not blindly retry comment creation after an uncertain network result: it may already have succeeded. Re-read comments before retrying. Idempotency keys are a possible later enhancement, not a v1 guarantee.

## 7. Runtime policy and integrity

- Use Zod for structural validation, defaults, and required text.
- Use entity lifecycle hooks for persisted invariants, including generated operations.
- Use authenticated principal identity for comment attribution.
- Use normal scopes for action authorization; one human user does not mean anonymous access.
- Perform business reads and mutations through Embody entity accessors, not direct database writes.
- Keep mutation and decision-comment writes in the same transactional execution path.
- Verify lifecycle payloads and supported typed helpers against installed declarations.
- Use actionable errors without leaking records from other organizations.

Example policy errors:

```text
Task cannot block itself.
Blocker must belong to the same project as the task.
Dependency would introduce a cycle.
Cancellation requires a nonempty reason.
Task cannot be deleted while other tasks reference it as a blocker.
```

Cycle prevention must account for concurrent requests, not just sequential updates. Verify transaction/isolation guarantees in the installed persistence implementation. If concurrent graph edits can both pass validation and create a cycle, add appropriate serialization or supported locking before claiming cycle safety.

## 8. Implementation plan

### Phase completion contract

Each phase is complete only when **every definition-of-done checkbox passes** and the evidence is recorded. A missing, skipped, or failing check means the phase is not done. Later-phase work cannot substitute for an earlier phase's acceptance checks.

For each phase, record evidence in `docs/verification.md` inside the Kanban project: date, commit or working-tree reference, runtime/package versions, exact commands, exit codes, named test cases, and links to relevant artifacts. Redact credentials and tokens. Use actual observations, not statements of intent.

Automated checks must execute real tests: an empty test suite, skipped policy tests, or a root command that finds no packages does not satisfy a phase. Deployment checks may use a repeatable script or a documented manual procedure with captured results. They must not be silently replaced by mocks.

### Phase 1: scaffold and verify

The project directory already contains documentation. Before scaffolding, preserve these files and verify whether the scaffold supports a nonempty target. If it does not, temporarily move the documentation aside, scaffold, then restore it without overwriting scaffold files.

From the repository root, once the target is ready:

```sh
pnpm create embody-app apps/kanban
pnpm install
```

- Use Node.js 22 or 24, TypeScript, and ESM.
- Set a unique private package name and preserve scaffold configuration.
- Keep one root `pnpm-lock.yaml`; no nested workspace or app-local lockfile.
- Inspect installed `@embody/*` declarations, README files, and example tests.
- Verify record IDs, hook payloads, identity types, filtering, pagination, transactions, and gateway registration expectations.
- Assign this app its own database path and port; commit only secret-free environment examples.

#### Definition of done

- [ ] `apps/kanban/package.json` defines a unique private ESM package, Node.js 22/24 support, and working `typecheck`, `test`, and `build` scripts. Running each targeted script exits 0; the test script executes at least one passing smoke test.
- [ ] Installation succeeds from the repository root. There is exactly one workspace lockfile (`pnpm-lock.yaml` at the root), no nested workspace, and no app-local lockfile. Existing Kanban documentation remains intact.
- [ ] The scaffolded host starts using the documented local command and configuration. Its health endpoint returns HTTP 200, the manifest identifies the configured app, and the process shuts down cleanly.
- [ ] A smoke test imports the app configuration, creates an `@embody/testing` harness, executes a real kernel operation, and closes the harness without leaked resources.
- [ ] `docs/framework-contracts.md` records installed package versions and declaration/source references for record IDs, principals, lifecycle payloads, CRUD signatures, filters, pagination, transaction/isolation behavior, and gateway registration. Unknown capabilities are explicitly listed as blockers for the phase that needs them, not assumed available.
- [ ] Local configuration has an app-specific port and database path. A secret-free `.env.example` documents required variable names; real credentials and generated databases are ignored and absent from staged/tracked files.

**Required evidence:** successful install and targeted-check output, smoke-test name/result, health response, manifest app ID, sanitized startup/shutdown output, and the framework-contract reference document.

### Phase 2: entity model and invariant tests

- Define projects, tasks, and comments in the tracker plugin.
- Add descriptions, required fields, defaults, and indexes used by actual queries.
- Add relationship, cancellation, hierarchy, and deletion policies.
- Implement checks against the merged current record plus proposed patch, not just fields present in the patch.
- Test via `@embody/testing`, including direct generated operation paths.
- Implement trusted comment creation and transactional cancellation-history behavior needed to test persisted invariants; Phase 3 verifies these through agent access.

#### Definition of done

- [ ] Decisions 1–5 in Section 10 are resolved and recorded as concrete rules in this document before dependent tests are finalized. No test is skipped because the expected policy is undecided.
- [ ] Integration tests through `@embody/testing` prove all three entities' required fields, defaults, record IDs, and supported task statuses. Persisted read-back matches the expected data, not merely a successful action response.
- [ ] Tests prove project-scoped listing, child lookup, and chronological comment pagination. Fixtures exceed a page boundary and assertions verify no missing or duplicate records.
- [ ] Both create and generated update paths reject missing references, cross-project/organization references, self-references, duplicate blockers, and direct/indirect dependency and hierarchy cycles. A multi-page graph fixture proves validation does not stop at the first page.
- [ ] Tests prove blocker resolution depends only on `done`: canceling does not resolve a blocker, explicit removal changes derived state, completed references remain stored, and reopening a blocker makes it unresolved again. Parent/subtask gating follows the recorded decision and has tests for both allowed and denied behavior where applicable.
- [ ] Cancellation, reason edits, and reopening have persisted-state assertions matching the approved history policy. Comment authorship comes from the principal; attempted spoofing is tested at every accessible create path. Failure injection proves a task mutation and its decision comment roll back together.
- [ ] Tests prove the approved project-move, append-only comment, and deletion policies, including incoming references. Rejected mutations leave the original records unchanged.
- [ ] A deterministic concurrency test attempts conflicting graph edits and proves no invalid cycle commits. The required isolation/serialization mechanism is documented and exercised; unsupported concurrency guarantees cannot be waived as a passing result.
- [ ] Targeted `typecheck`, `test`, and `build` all exit 0. The invariant suite contains no skipped acceptance cases, closes every harness, and asserts intended failure classes/reasons with scopes sufficient to reach the tested policy.

**Required evidence:** a requirement-to-test mapping for Section 9, passing test output, rollback/concurrency test names and results, recorded policy decisions, and targeted-check output.

### Phase 3: agent workflows

- Implement `addComment` with derived authorship.
- Implement a bounded `getTaskContext` action if generated reads prove too cumbersome.
- Record cancellation decisions transactionally.
- Configure least-privilege scopes for owner and agent access.
- Verify catalogs, CLI inspection, and app-scoped MCP discovery through the chosen gateway.

#### Definition of done

- [ ] The gateway choice is recorded with a repeatable setup procedure. The actual app registers successfully and appears in the catalog; these checks use a running gateway/host, not only a kernel harness.
- [ ] An agent credential can discover and execute the permitted project/task reads and mutations and `addComment`. An unauthenticated call is rejected, and the same agent is denied destructive operations and comment edits/deletions for the intended authorization or policy reason.
- [ ] Agent and human comment tests verify stored `authorId` and `authorType` match the authenticated principal. Agent-supplied authorship cannot impersonate another caller. Cancellation decision comments have equally verified attribution.
- [ ] The task-context interface is finalized: either `getTaskContext` exists with tested output bounds and pagination/truncation behavior, or documented generated reads provide the equivalent task, project, blocker, child, and comment information. Large-fixture tests prove the selected approach does not return an unbounded tree or silently omit relevant unresolved blockers.
- [ ] `apps inspect kanban` succeeds through the CLI. App-scoped MCP discovery exposes the expected permitted targets, and a real MCP call creates or reads a task and adds a comment. Forbidden targets are not available as invocable tools to that principal.
- [ ] A reproducible agent-access smoke scenario creates a project, parent task, verification subtask, and blocker; updates status; adds evidence; cancels the blocker; observes the dependency still unresolved; and explicitly removes it. Stored records match every step's expected result.
- [ ] This usage guide contains tested invocation examples for the actual IDs and interfaces. Placeholder IDs and secret-safe environment setup are clearly identified; speculative action names or CLI flags are removed or labeled as unimplemented proposals.
- [ ] Targeted `typecheck`, `test`, and `build` exit 0, including permission, authorship, and context-contract tests.

**Required evidence:** sanitized gateway catalog, CLI/MCP commands and responses, agent smoke-scenario assertions, expected-denial results, final context contract, and targeted-check output. Never capture bearer tokens.

### Phase 4: acceptance and operations

- Run a complete create/read/update/comment/subtask/dependency/cancel scenario.
- Verify persistence after restart.
- Confirm the inspector is not publicly exposed.
- Configure backups, credentials, and gateway access for the actual deployment.
- Replace conceptual usage examples with discovered, tested invocations where appropriate.

#### Definition of done

- [ ] An end-to-end acceptance scenario through the deployed agent interface verifies project isolation, parent/subtask links, definitions of done, comments/evidence, all four statuses, blocker resolution, cancellation rationale/history, and explicit dependency removal. Each step asserts returned and persisted values against the approved rules.
- [ ] A restart test creates representative records, stops and restarts the host against the same database, then verifies identical IDs, business data, comments, parent links, and blocker links. The app reappears in the gateway catalog after restart.
- [ ] A backup/restore drill restores that dataset into a separate clean database and verifies record counts and relationships through the app. Document exact backup/restore commands, expected downtime, and where backups are stored without exposing secrets.
- [ ] The intended network boundary is tested from outside the host: unauthenticated gateway execution is rejected and development inspector routes are unreachable externally. Local health checks still pass. Production or remote access uses the documented TLS boundary.
- [ ] Host registration, gateway signing, and client credentials are configured as separate secrets where required; no real secrets, databases, or generated build output are staged/tracked. Rotation and restart/re-registration procedures are documented and successfully exercised with disposable credentials.
- [ ] Operations documentation gives an operator exact start, stop, health, restart, backup, restore, and credential-rotation procedures. Another clean environment can follow the setup without undocumented local files.
- [ ] From a clean checkout plus documented environment configuration, root installation and `pnpm check` exit 0 and actually execute Kanban's typecheck, nonempty test suite, and build. The deployed agent smoke scenario also passes against that build.
- [ ] Acceptance evidence maps every confirmed requirement in Section 1 to a passing test or deployment check. No unresolved decision or unverified capability remains that affects shipped behavior; limitations such as non-atomic read-modify-write dependency edits are explicitly documented.

**Required evidence:** end-to-end assertions, before/after-restart record comparisons, backup/restore drill results, external-network denial checks, sanitized rotation results, clean-environment check output, and the final requirement-to-evidence mapping.

## 9. Test plan

Integration tests should exercise the kernel boundary rather than invoke handlers directly. Always close the harness.

### Schema and basic behavior

- Required project names, task titles, task definitions of done, and comment bodies reject blank values.
- Defaults produce `todo`, empty blockers, null parent, and empty descriptions.
- Every supported status can be persisted.
- Tasks can be retrieved and listed by project; comments and subtasks are paginated.

### Relationships

- Missing or cross-organization references are rejected without leaking foreign data.
- Cross-project parents and blockers are rejected.
- Self-references, duplicate blockers, direct cycles, and indirect cycles are rejected.
- Reparenting preserves valid hierarchy.
- No truncation bug permits a cycle beyond the first query page.
- Proposed immutable `projectId` policy applies to generated updates.

### Blockers

- Only `done` resolves a dependency.
- Canceled blockers remain unresolved.
- Explicit removal unblocks the dependent when no unresolved blockers remain.
- Resolved IDs stay stored.
- Reopening a blocker changes the derived context without silently changing dependent status.

### Subtasks and completion

- Tasks can exist without subtasks.
- Subtasks have independent status, comments, blockers, and definitions of done.
- Parent state does not change automatically when a child changes.
- Once the gating decision is confirmed, test either informational completion or strict child-completion rules explicitly.

### Cancellation and comments

- Canceling without a reason fails without changing persisted state.
- Cancellation rationale is recorded with the actual caller's identity.
- Reopening clears current cancellation state but preserves the earlier decision comment.
- Comment author spoofing is rejected or overwritten by trusted identity at every accessible create boundary.
- Comment edits/deletions fail for the intended authorization or policy reason.
- Failed mutations leave no partial task update or decision comment.

### Deletion, permissions, and concurrency

- Deletion cannot leave dangling blockers, children, or comments.
- Nonempty projects cannot be deleted.
- Normal agent scopes permit intended reads/updates/comments but not destructive operations.
- Permission tests fail for authorization reasons; invariant tests use adequate scopes so they reach the hook being tested.
- Concurrent dependency/hierarchy edits cannot violate claimed graph guarantees.
- Document observed update conflict behavior; do not imply unsupported lost-update protection.

### Verification commands

```sh
pnpm --filter './apps/kanban' typecheck
pnpm --filter './apps/kanban' test
pnpm --filter './apps/kanban' build
pnpm check
```

Until an app exists, root checks skip absent package scripts and do not validate this planned application.

## 10. Remaining decisions

The implementation adopts the recommended defaults for decisions 1–5 under the request to build the app:

1. **Blocker enforcement:** informational; unresolved blockers do not prevent starting/completing.
2. **Subtask enforcement:** independent statuses, no automatic cascade or completion gate.
3. **Cancellation history:** required nonblank reason; cancellation, reason edits and reopening append caller-attributed comments in the same transaction. Reopening explicitly supplies `cancellationReason: null`. The automatic reopen comment preserves the prior rationale; callers should additionally explain the changed decision using `addComment`.
4. **Project moves:** `projectId` is immutable.
5. **Deletion and comments:** comments are append-only for all callers. Task/project deletion additionally requires a human `owner` role, sufficient scopes, and no incoming references/comments/tasks. Generated comment create overwrites supplied authorship and ordering; normal agent scopes omit this operation.
6. **Deployment:** unresolved. This release supports local loopback SQLite only, not production PostgreSQL. Gateway catalog/CLI/MCP, TLS, remote boundary and credential rotation checks remain blocked on a real deployment.

### Verified implementation refinements

- Comment `data.sequence` is a server-owned, per-task chronological ordering key. The installed framework cannot sort generated lists by envelope `createdAt`; UUID ordering is not chronological. Do not supply/override this field or use a different sort for chronological pagination.
- `getTaskContext` returns every blocker (at most 100), and a direct-child page (default 20, max 100) with `childrenTruncated` and `nextChildrenOffset`. It does not include recursive trees or comment history.
- Project graphs are limited to 1000 tasks. Validation scans all pages or rejects an over-limit graph, never silently stops at a page boundary.
- SQLite uses `BEGIN IMMEDIATE` and rejects overlapping connection transactions. A deterministic conflicting-edge test proves no cycle commits under the supported adapter; clients must not assume request queuing or lost-update protection.
- Project/task defaults use preprocessing rather than Zod field `.default()` because the installed Zod version inserts defaults into generated partial-update payloads. A regression test verifies omitted fields are preserved.

Future team membership should build on Embody principals and scopes. Assignment, role semantics, atomic dependency edits, richer audit history, and strict completion policies can be added when the workflow demonstrates a need—not as speculative v1 complexity.
