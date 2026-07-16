---
name: case-closure-hygiene
description: "Runs a support org's closure SOP checklist on a Success Guide's cases — so real work lands as a countable Completed close, cancelations are coded correctly (Duplicate / out-of-scope Redirect), CSAT actually fires, and open cases stay hygienic (regular comments, follow-up date). Read-only + draft: it inspects a case, tells you exactly which fields to fix (you set them in the support-org UI), and drafts SOP outreach for non-responsive customers. TRIGGER when: user says 'closure check', 'is this case ready to close', 'case hygiene', 'clean up my cases', 'why isn't this counting', or before closing/canceling a case. DO NOT TRIGGER when: the user wants qualitative-contribution logging (that's /brag-book) or the daily digest (that's the cron)."
metadata:
  type: orchestrator
  version: "1.4"
  last_updated: "2026-07-15"
  author: "Success Guide"
  audience: "Success Guides protecting closure/cancelation/CSAT metrics"
---

# Case Closure Hygiene — code the win, protect the metrics

> **⚙️ Setup:** This skill reads your `booking_link` (self-service scheduling URL) from `~/.claude/profile.md` — run `/setup-profile` once after cloning and set it when asked; no need to edit this file. Your support-org `userId` and timezone are read live via `getUserInfo`. Field API names below (`Sub_Status__c`, `Case_Cause__c`, `Sub_cause__c`, `Additional_Details_for_Cause__c`, `Next_Follow_up_Date__c`, `Age_days__c`) are from one org's Case schema — **verify them against your own org** with `getObjectSchema('Case')` before relying on the SOQL.

## Purpose

A Success Guide's closure/cancelation/CSAT metrics hinge on cases being **closed with the codes that count**. It's common to find delivered work sitting at a **null Sub-Status** (invisible to the "completed closures" metric) and a cancelation rate inflated by cases that should have been coded Duplicate or Redirected. This skill runs the closure-SOP checklist on a case (or your open list) so:

- delivered work lands as **Completed** (a countable closure toward your monthly target),
- cancelations that shouldn't count against you are coded right (**Duplicate**; out-of-scope → **Redirected**),
- **CSAT actually fires** (Contact Name verified),
- open cases stay hygienic (regular comments, live follow-up date) so time-to-resolve trends down.

> **Read-only + draft — never writes to Salesforce.** If your support-org MCP is read-only, this skill *tells you which fields to set* and *drafts* the outreach **and the final case comment (paste-ready, Published unchecked — Step 3.5)**; **you** make the changes in the support-org UI. It never claims to have saved anything.

> **⚙️ Subagent discipline.** Runs **inline by default** — a single case is 2–3 bulk reads. Fan out **only** for a full-backlog sweep — then one subagent per batch, never per case.

---

## The closure taxonomy (what each outcome must be coded)

| Outcome | `Sub_Status__c` | `Case_Cause__c` | Counts as… | Notes |
|---|---|---|---|---|
| **Delivered / resolved** | `Completed` | best-fit cause (e.g. `Documentation or User Knowledge Issue` + Sub-Cause `User needs instructions or training` for coaching) | ✅ **a closure (the completed-closures metric)** | If real work was done, it MUST be Completed — not null. |
| **Duplicate case** | `Canceled` | `Duplicate` | ⬜ **does NOT count against completion rate** | Always code dupes this way. |
| **Out of scope** (belongs to another team) | `Redirected` | `Out of scope` | ⬜ legitimate throughput, **not a cancel** | Set `Additional_Details_for_Cause__c` to the receiving team + message them. |
| **Customer non-responsive** | `Canceled` | `Canceled` (Sub-Cause `Customer Non-Responsive`) | cancel | Only after **3 attempts over 2 weeks**. |
| **Customer withdrew** | `Canceled` | `Canceled` (Sub-Cause `Customer Withdrew Request`) | cancel | Document in a case comment. |
| **Wrong program picked** | *(don't close)* | — | — | **Change `Success_Program__c` instead of canceling** — keeps the case, no cancel hit. |
| **No language support** | `Redirected` | — (Sub-Cause `Salesforce Declined to Proceed`) | redirect | Try your translation-swarm channel first. |

---

## The case lifecycle & the "Pending Closure" sub-status

Many support orgs run cases through **New → Qualification → Delivery → Closed** with a scheduler that auto-advances sub-statuses. A key one is **`Delivery` / `Pending Closure`** (or your org's equivalent "awaiting closure" sub-status): the scheduler auto-sets it once the delivery/meeting completes.

> **A "Pending Closure" case is READY TO CLOSE, not waiting.** Verify against YOUR SOP, but commonly there is **no auto-close and no documented grace period** — the case sits open (consuming Omni/queue capacity and aging TTR) until the guide manually closes it. If delivery happened and resources were sent, "send resources and wait" is the wrong instinct: **closing the case IS the next step** (it's also what fires CSAT). Treat every such case as `READY TO CLOSE COMPLETED` unless delivery genuinely didn't occur.

### Close-Out checklist (map to your SOP's "Case Closure Steps")

1. **Final deliverables emailed** to the customer.
2. **Contact Name** verified = correct person (*this is the CSAT recipient*; blank = no survey).
3. **Files** — upload delivery assets (deck / doc).
4. **Delivery Language** field = language delivered in.
5. **Program / offer** field correct.
6. **Final case comment** added — the skill drafts it paste-ready (Published unchecked) for you in Step 3.5.
7. **Close Case** action → set **Status=`Closed`, Sub-Status=`Completed`**, **Case Cause** best-fit.
8. Create any **follow-up case** if needed.
9. **Notify the account team / case creator** with a summary; flag **attrition risk → renewal mgr** or **upsell → AE** if either applies.

CSAT typically fires at/after closure — so closing grows your CSAT sample. Confirm your org's CSAT suppression rules (e.g. translation child cases often send none).

---

## Prerequisites

- **Support-org MCP** `✓ Connected`, `getUserInfo` username matches your support org. If down, stop and say so.
- **Slack MCP** for drafting outreach (optional; drafts can be shown in-terminal).
- **Gmail MCP** (optional) to confirm the latest outbound/inbound on the case thread.

## Step 0 — Anchor time + scope

1. **Anchor "now"** via `getUserInfo` — capture `userId`, `timeZoneIana`, wall-clock. Convert relative dates to absolute DD/MM.
2. **Scope:** a specific `CaseNumber` if given; else "my open cases" =
```soql
SELECT CaseNumber, Subject, Status, Sub_Status__c, Case_Cause__c, ContactId, Contact.Name,
       Success_Program__c, Delivery_Language__c, Next_Follow_up_Date__c, Age_days__c,
       CreatedDate, IsClosed
FROM Case
WHERE OwnerId = '<userId>' AND IsClosed = false
ORDER BY Age_days__c DESC
```
   Also flag **uncounted closes** to back-code — real Completed work sitting at null Sub-Status:
```soql
SELECT CaseNumber, Subject, ClosedDate, Case_Cause__c
FROM Case
WHERE OwnerId = '<userId>' AND Status = 'Closed' AND Sub_Status__c = null
  AND ClosedDate >= LAST_N_DAYS:90
ORDER BY ClosedDate DESC
```

## Step 1 — Read the case's real state (inline, bulk)

> **The case's OWN records are ground truth — read them before deciding anything is "unsent," "owed," or "ready to chase."** In many support orgs case emails are sent from a shared address (e.g. `customersupport@salesforce.com`) and live on the case as `EmailMessage`; they do **NOT** land in your personal Gmail, so never infer "no deliverables were sent" from your inbox or from case age alone. Read the latest outbound **body** (below) — if it already contains the resources/recap, close-out step 1 is **done** and the case is likely READY TO CLOSE, not chased. The `CaseComment` feed is also where the guide mirrors each email and pastes the **account-team / case Slack channel link** — harvest that link when you notify the account team (close-out step 9) instead of hunting for the channel.

For each in-scope case:
- **CaseComments** — newest comment (older than your comment cadence?), `Next_Follow_up_Date__c` (null or past?), and the mirrored **email links + account-team / case Slack channel link** to reuse when you notify the account team (close-out step 9):
```soql
SELECT ParentId, CommentBody, IsPublished, CreatedDate, CreatedBy.Name FROM CaseComment
WHERE ParentId = '<caseId>' ORDER BY CreatedDate DESC
```
- **EmailMessage** — who spoke last, when, and the outreach-attempt count:
```soql
SELECT ParentId, Incoming, MessageDate, Subject FROM EmailMessage
WHERE ParentId = '<caseId>' ORDER BY MessageDate DESC
```
- **Read the BODY of the latest outbound** (`Incoming = false`) — metadata alone can't tell you whether deliverables actually went out (close-out step 1); this is what prevents a redundant "send resources" chase:
```soql
SELECT TextBody, MessageDate, Subject FROM EmailMessage
WHERE ParentId = '<caseId>' AND Incoming = false ORDER BY MessageDate DESC LIMIT 1
```
- Count **outbound** emails since last inbound → the attempt number for the non-responsive clock.

## Step 1.5 — Entitlement lookup: Account → Asset Line Items (editions, add-ons, license counts)

When a case turns on **what the customer actually owns** — a licensing/entitlement question, "do they have the edition/add-on/SKU for X", a product-prerequisite check — **look here FIRST, not "ask the account team."** In many orgs the purchased-products feed is federated onto the **Account's Asset Line Items related list** (a CPQ external object — in this org `Apttus_Config2_AssetLineItem__x` via the `Asset_Line_Items__r` relationship, keyed by an Account-Id field). **Verify the object/relationship/field names against your own org** with `getObjectSchema('Account')` before relying on the SOQL.

- **UI path:** open the Account → related list **Asset Line Items**.
- **⚠️ Query it via the Account relationship subquery — NOT a direct filter on the external object.** A direct `SELECT … FROM <AssetLineItem__x> WHERE <AccountIdField> = '<id>'` is **unreliable**: the OData equality filter may not push down and can silently return **zero rows for a fully-federated account**. Never trust a zero from that form. Traverse from the Account instead (this is the path the Lightning related list uses):

```soql
SELECT Id, Name,
       (SELECT Id, Name__c, <LineType>, <Quantity>, <IsInactive>, <StartDate>, <EndDate>
        FROM Asset_Line_Items__r)
FROM Account WHERE Id = '<AccountId>'
```

- **Active only:** keep lines where the inactive flag is `false` AND the end date is in the future vs the Step-0 anchor. Inactive/expired lines are history — prior terms, lapsed **trials**, negative-quantity true-up adjustments. Don't report a lapsed trial as a current entitlement.
- **Read the EDITION off the "… - Enterprise/Unlimited Edition" line; read ADD-ONS off their own lines.** An active, in-term add-on line = they own it. Quantity = seat count (net out negatives).
- **What still needs the account team:** raw ownership (edition, add-on present, seat counts, term) is now confirmed from data — say so, drop the blanket "confirm with account team." Asset Line Items can't answer: consumption/credit balances, whether an add-on's units cover a specific sub-feature, contract nuance, roadmap, or an account that genuinely returns no lines.
- **If Asset Line Items can't confirm a SKU/license/add-on → ask the account team via the case's internal Slack channel.** Post a concise confirmation request naming the exact SKU/entitlement question + the case link to the case's channel (`case-<last6>-<account-slug>`; fall back to a DM to the core account executive, plus the CSM only for the top support tier). **Internal only** — never to the customer, never a Slack Connect/external channel; if the target is external or unresolvable, produce a paste-ready draft instead of sending. The customer email stays draft-only regardless.

This is the first stop for the Step 3.6 licensing/entitlement research before any escalation caveat.

## Step 2 — Produce the hygiene checklist (per case)

Present a compact checklist — ✅ good / ⚠️ fix, each fix naming the **exact field + value** to set in the support-org UI:

```
🧹 Closure hygiene — Case <#> · <Account> · <Age>d · Status <..>/<Sub-Status ..>

Readiness to close as a WIN:
  [⚠️] Sub-Status is <null> → set Sub_Status__c = 'Completed' (this is what makes it count)
  [⚠️] Case Cause blank → set Case_Cause__c = '<best-fit>' (+ Sub-Cause)
  [✅/⚠️] Delivery Language set / Success Program correct
CSAT will fire?
  [⚠️] Contact Name blank → set a real Contact (CSAT goes to this person)
Open-case hygiene:
  [⚠️] No comment in N days → add a case comment
  [⚠️] Next Follow-up Date null → set Next_Follow_up_Date__c
Outreach clock (if non-responsive):
  Attempt X of 3 · last outbound N days ago · next: <touch / clean-cancel>

→ Verdict: <READY to close Completed> / <CANCEL as Duplicate — won't count> / <REDIRECT> / <KEEP OPEN — send Nth touch>
```

- **Never invent** a Completed close where work wasn't done — flag "verify delivery."
- For duplicates / out-of-scope / wrong-program, state the correct taxonomy row + receiving team / new program.

## Step 3 — Draft outreach (only when the verdict needs it)

For non-responsive cases inside the 3-attempts-over-2-weeks window, draft the SOP-templated touch (plain text, **no `>` blockquotes**; localized language matching the thread; verify the contact's **first name** from the thread's From/signature, never the email handle):

- **1st / 2nd / 3rd touch** per your SOP templates; a meeting-ask touch includes your `booking_link` (from `~/.claude/profile.md`) inline.
- **Guide, don't implement.** On case work a Success Guide guides/enables — never offers to configure the customer's org or "run the setup" for them. Frame working-session offers as guided enablement ("I'll walk your team through it"). **Never offer a solution architect unless the account's success-plan tier includes a CSM** — no CSM means no architect path (e.g. a Premier-tier account without a CSM). Confirm the tier first.
- Append your standard **email signature** block.
- Drafts only — nothing sent from this skill.

## Step 3.5 — Draft the final case comment (paste-ready → OrgCS, Published unchecked)

When the verdict is **close as Completed** (close-out step 6) — or a cancel/redirect that needs documenting — draft the **final case comment**: the internal record of the outcome, so it lives on the case in the support org, not just in your head. Plain text, **no `>` blockquotes**, same console format the post-call flow uses:

```
─ Internal Case Comment (paste → OrgCS, Published unchecked) ─
Case <CaseNumber> · <Account>

Outcome: <what was delivered / why closing / cancel-redirect reason>
Delivered: <resources / recap sent to the customer>
Coding: Sub_Status__c = <Completed / Canceled / Redirected>, Case_Cause__c = <best-fit> (+ Sub-Cause)
Follow-up: <new case / none>
────────────────────────────────────
```

- **How to log it:** on the case, **Add Case Comment** and **leave "Published" unchecked** (support-internal, never customer-visible), then paste the block body.
- **Read-only today — you commit the paste.** It maps 1:1 to a `CaseComment` (`ParentId` = the case Id, `CommentBody` = the block body, `IsPublished = false` = "Published" unchecked). If a write-enabled support-org MCP ever lands (a `sobject-mutations`-style `create`), this inserts the `CaseComment` directly instead of handing you a block — same content. Never claim it saved. See [[orgcs-case-comment-paste-ready]].

## Step 3.6 — Research-backed response for owed deliverables (on-demand read-only subagent)

When a case owes the customer a **substantive answer or resource that needs research to answer well** — a licensing/entitlement question, an implementation/setup guide, a "how do I…" that should cite official docs, or a product-capability confirmation ("check with Product whether X is supported") — don't draft from memory. Deploy a **read-only research subagent** to gather a resource pack first, so the reply is grounded in current official sources:

- The subagent reads the case's own records (`EmailMessage` body + `CaseComment` feed, per Step 1) to pin the EXACT ask, then searches **Salesforce Help/Docs** + **Trailhead**, and returns a **resource pack** (title · official URL · 1-line relevance) plus a resource-backed **draft reply** in the Step-3 standards (no `>` blockquotes; localized language matching the thread; booking link on meeting asks; your signature).
- **For licensing/entitlement asks, run Step 1.5 FIRST** — pull the Account's Asset Line Items (relationship subquery) and confirm the edition / add-on / seat count / term straight from data before drafting. Only what Asset Line Items can't answer (consumption/credit balances, sub-feature coverage, contract nuance, roadmap) gets the "confirm with the account team" caveat.
- **Verify before asserting.** Confirmed doc facts go in the reply; anything org/contract-specific not resolved by Step 1.5 (pricing, roadmap, sub-feature nuance) is flagged "confirm with the account team," never invented.
- **Subagent discipline:** inline for a single owed item; fan out **one subagent per owed deliverable** only when researching several at once (a full-backlog sweep, or a scheduled owed-deliverable pass). Time-box each (~4 min).
- **Draft/text only — never sends.** Same fence as the rest of the skill: customer email is draft text for copy-paste; nothing is sent and nothing is written to Salesforce.

---

## Output Standards

- **Advise + draft, never write to Salesforce.** Every fix names the exact field/value; the user sets it. Never claim a save happened.
- **Code the win:** the highest-value output is turning a null-Sub-Status close (or a ready case) into a countable **Completed**.
- **Protect against false cancelation:** surface Duplicate / Redirect / change-program alternatives before a plain cancel.
- State the anchor time, timezone, cases checked. Report any MCP gap rather than a false "all clean."
- Respect data-handling policy — case content stays scoped; customer drafts are public-safe.

## Known Limitations

| Limitation | Status | Workaround |
|---|---|---|
| Support-org MCP may be read-only | By design | Skill advises exact field values; user edits in the UI |
| Can't write the final case comment | Handled | Drafts it paste-ready (Published unchecked); auto-inserts as `CaseComment(IsPublished=false)` if a write-enabled support-org MCP lands ([[orgcs-case-comment-paste-ready]]) |
| "Was real work delivered?" isn't always machine-knowable | By design | Flag "verify delivery" before coding Completed |
| Outreach-attempt count inferred from EmailMessage only | v1 | Cross-check with case comments; user confirms |
| Email metadata alone can't confirm deliverables were sent, so a delivered case looked like it still owed a "send resources" email | Fixed v1.1 (2026-07-15) | Step 1 reads the latest outbound `TextBody` + harvests the account-team / case Slack channel link from `CaseComment`; never infer "unsent" from personal Gmail or age |
| Field API names / picklist values are org-specific | Data | Verify with `getObjectSchema('Case')` before trusting the SOQL |
| A direct filter on the Asset Line Items external object (`… WHERE <AccountIdField>=…`) can silently return 0 rows for a federated account (OData filter doesn't push down) | Fixed v1.3 (2026-07-15) | Step 1.5 reads Asset Line Items via the **Account relationship subquery** (`(SELECT … FROM Asset_Line_Items__r) FROM Account WHERE Id=…`); never trust a zero from the direct-filter form; verify object/field names with `getObjectSchema('Account')` |

## Related

The operational engine behind the quantitative half of a Success Guide promotion (closures = completed sub-status; cancelation levers). A promotion-coach cron can nudge toward it when a case goes stale or a close is left uncoded. Sibling skills: `/brag-book` (the qualitative half), `/orgcs-case-age` (which cases are aging).
