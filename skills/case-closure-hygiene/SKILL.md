---
name: case-closure-hygiene
description: "Runs a support org's closure SOP checklist on a Success Guide's cases — so real work lands as a countable Completed close, cancelations are coded correctly (Duplicate / out-of-scope Redirect), CSAT actually fires, and open cases stay hygienic (regular comments, follow-up date). Read-only + draft: it inspects a case, tells you exactly which fields to fix (you set them in the support-org UI), and drafts SOP outreach for non-responsive customers. TRIGGER when: user says 'closure check', 'is this case ready to close', 'case hygiene', 'clean up my cases', 'why isn't this counting', or before closing/canceling a case. DO NOT TRIGGER when: the user wants qualitative-contribution logging (that's /brag-book) or the daily digest (that's the cron)."
metadata:
  type: orchestrator
  version: "1.0"
  last_updated: "2026-07-08"
  author: "Success Guide"
  audience: "Success Guides protecting closure/cancelation/CSAT metrics"
---

# Case Closure Hygiene — code the win, protect the metrics

> ⚙️ **Setup:** replace `<YOUR_SLACK_USER_ID>` (Slack profile → ⋯ → *Copy member ID*); your support-org `userId` is read live via `getUserInfo`; `<your timezone>` (IANA, e.g. `America/New_York`); `<YOUR_BOOKING_LINK>` (your self-service scheduling URL). Field API names below (`Sub_Status__c`, `Case_Cause__c`, `Sub_cause__c`, `Additional_Details_for_Cause__c`, `Next_Follow_up_Date__c`, `Age_days__c`) are from one org's Case schema — **verify them against your own org** with `getObjectSchema('Case')` before relying on the SOQL.

## Purpose

A Success Guide's closure/cancelation/CSAT metrics hinge on cases being **closed with the codes that count**. It's common to find delivered work sitting at a **null Sub-Status** (invisible to the "completed closures" metric) and a cancelation rate inflated by cases that should have been coded Duplicate or Redirected. This skill runs the closure-SOP checklist on a case (or your open list) so:

- delivered work lands as **Completed** (a countable closure toward your monthly target),
- cancelations that shouldn't count against you are coded right (**Duplicate**; out-of-scope → **Redirected**),
- **CSAT actually fires** (Contact Name verified),
- open cases stay hygienic (regular comments, live follow-up date) so time-to-resolve trends down.

> **Read-only + draft — never writes to Salesforce.** If your support-org MCP is read-only, this skill *tells you which fields to set* and *drafts* the outreach; **you** make the changes in the support-org UI. It never claims to have saved anything.

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
6. **Final case comment** added.
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

For each in-scope case:
- Latest **CaseComments** (is the newest older than your comment cadence? is `Next_Follow_up_Date__c` null or past?).
- Latest **EmailMessage** (who spoke last, when — the outreach-attempt count).
```soql
SELECT ParentId, Incoming, MessageDate, Subject FROM EmailMessage
WHERE ParentId = '<caseId>' ORDER BY MessageDate DESC
```
- Count **outbound** emails since last inbound → the attempt number for the non-responsive clock.

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

- **1st / 2nd / 3rd touch** per your SOP templates; a meeting-ask touch includes `<YOUR_BOOKING_LINK>` inline.
- Append your standard **email signature** block.
- Drafts only — nothing sent from this skill.

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
| "Was real work delivered?" isn't always machine-knowable | By design | Flag "verify delivery" before coding Completed |
| Outreach-attempt count inferred from EmailMessage only | v1 | Cross-check with case comments; user confirms |
| Field API names / picklist values are org-specific | Data | Verify with `getObjectSchema('Case')` before trusting the SOQL |

## Related

The operational engine behind the quantitative half of a Success Guide promotion (closures = completed sub-status; cancelation levers). A promotion-coach cron can nudge toward it when a case goes stale or a close is left uncoded. Sibling skills: `/brag-book` (the qualitative half), `/orgcs-case-age` (which cases are aging).
