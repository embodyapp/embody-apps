# GenUI for a narrow chat surface

Design the default experience for a 320–560px-wide, vertically scrolling chat panel. A desktop monitor does not imply a wide artifact. Keep this model when designing future app views.

## Start with the decision

Each view should answer one question and offer one clear next action. For the CRM, the list answers “Which customer needs my attention?”; an opportunity answers “What do we do next for this deal?”; a stage form records a specific change.

## Layout rules

- Use one vertical column. Avoid stage lanes, sideways carousels, broad tables and a second independently scrolling region inside the chat.
- Make one compact card per business object. The summary contains its name, customer, status, next step and due date. Put editing, evidence and commercial detail behind **Open opportunity**.
- Show a small, honest page. CRM defaults to five cards and exposes Previous/Next. Counts describe the visible page, not an invented pipeline total.
- Filter before paging at the server. A stage filter must find opportunities outside the currently loaded page.
- Preserve filter, account and page when opening an item and returning. Keep the selected opportunity after a confirmed stage change, even if it no longer matches the list filter.
- Give the selected item its own vertical detail view. Keep a clear Back action near the top. Account contacts, activity and onboarding are separate views rather than additional lists beneath every opportunity.
- Use native selects for bounded filters, short labels, wrapping text, at least 44px-high controls, and 16px input text. Long names and unbroken identifiers must fit without horizontal scrolling.
- Do not render empty values as rows of “Not recorded.” Show a missing fact when it explains what the user must do next. A zero, unquoted amount is **Not discussed**, not a free hosting offer.
- Use human-readable dates with an explicit timezone. The current CRM displays Israel time. Keep exact ISO timestamps and integer currency minor units in the action contract.
- Put mutation forms in the detail view. Preserve drafts on rejection; refresh authoritative data after success. Navigation uses ordinary read actions with explicit bound inputs. UI layout never replaces business hooks or authorization.
- Keep screen-specific styles in the application. Shared tokens can remain in `codex-theme`; the CRM should not change Kanban's layout as a side effect.

## CRM flow

```text
Hosting sales
  Sales stage [All stages] [Show]
  Card → Open opportunity
  Card → Open opportunity
  … up to five
  Page position · Previous / Next

Opportunity
  Back to opportunities
  Customer · Stage · Urgent follow-up, if needed
  Next step + owner + due date
  App and hosting / Evaluation / Commercial terms
  Update stage
  Open account

Account
  Back to sales
  Account view [Contacts / Activity / Onboarding / Opportunities]
  One selected list, with its own pagination
```

## Verification

Exercise the real compiled GenUI resource and Apps bridge at 320, 390 and 560px. Check document width, visible touch targets, card height, filtering past the first page, Back navigation, rejected drafts and selected-item reconciliation after mutation. Use disposable data for browser tests. Narrow screenshots are review artifacts, not proof that a particular chat client rendered the same resource.

The framework's initial runtime Refresh starts with the default workbench input. Once a read control navigates to a filter, page or detail, subsequent reconciliation uses that input. A direct agent-provided deep link still has that framework limitation; do not claim a layout change fixes it.
