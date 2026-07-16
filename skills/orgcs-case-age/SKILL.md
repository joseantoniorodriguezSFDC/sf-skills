---
name: orgcs-case-age
description: "Reads a Success Guide's OrgCS cases and flags ones where the customer hasn't responded in more than N business days (default 2), then sends a Slack alert. TRIGGER when: user says 'bring me up to date with my cases', 'check my stale cases', 'which cases are waiting on the customer', 'case age check', or asks who hasn't responded. DO NOT TRIGGER when: the user wants to create/update a case (OrgCS MCP is read-only), or is working in a demo/trial org (use the salesforce-sobject-all connection instead)."
metadata:
  type: orchestrator
  version: "1.2"
  last_updated: "2026-07-15"
  author: "Jose Antonio Rodriguez — Success Guide"
  audience: "Success Guides triaging their OrgCS case load"
---

> **⚙️ Setup:** This skill reads your context (Slack id, timezone, org) from `~/.claude/profile.md`. Run `/setup-profile` once after cloning — it auto-detects those and writes the profile. No need to edit this file.

# OrgCS Case Age — Stale-Case Triage

## Purpose

Answer one question fast: **"Which of my open OrgCS cases has the customer gone quiet on?"**

The skill reads the Success Guide's open, waiting-on-customer cases from the **read-only OrgCS MCP server**, inspects each case's email thread **and its internal case comments** to find the real last activity, flags any case where the **customer** has gone quiet **more than 2 business days** (tunable) *and* nothing is already in motion, and sends a Slack alert with the case numbers.

> **Two different clocks — don't conflate them.** *Customer silence* = no inbound customer email since our last outbound. *Case activity* = the most recent of {last outbound email, last internal `CaseComment`}. A case can be customer-quiet yet actively handled (e.g. you logged an internal note that an AE booked a call). Only flag for chase/closure when **both** clocks are stale — never closure-nudge a case you're actively progressing.

> **The case's OWN records are ground truth — read them BEFORE calling anything "unsent," "owed," or "quiet."** Case emails are sent from a shared support address (e.g. `customersupport@salesforce.com`) and live on the case as `EmailMessage` — they do **NOT** land in your personal Gmail, so never infer "no email was sent" from your inbox (or from case age alone). Read the **body** of the latest outbound `EmailMessage` (Step 3a), not just its metadata — resources you're about to "send" may already be in it. And **harvest the AE/case Slack channel link** the Guide mirrors into `CaseComment` (Step 3b) rather than guessing or searching for it.

> **OrgCS MCP is read-only.** This skill only *detects and alerts*. It cannot send follow-ups, change case status, or create records — the user does that in the OrgCS UI. See [[orgcs-mcp-readonly]].

> **⚙️ Performance / subagent discipline.** Runs **fully inline** — no subagents. Steps 3a/3b fetch email threads and comments for *all* cases in **one bulk query each** (`WHERE ParentId IN (<case Ids>)`), not one query per case. Bulk-querying beats fanning out a subagent-per-case on both tokens *and* latency; this skill is the reference example of "loop → bulk query, not loop → subagent." See [[feedback-subagent-discipline]].

---

## Prerequisites

### 0.1 — OrgCS MCP connected
Run `claude mcp list` and confirm an **`orgcs`** server shows `✓ Connected`.

- If missing or `! Needs authentication`: the OrgCS MCP isn't set up. Point the user to the setup doc (<your OrgCS MCP setup doc URL>) — download `deploy-orgcs-mcp.sh`, run it, restart Claude, then authenticate at `/mcp` via the **`orgcs` custom domain** (using a normal login throws `OAUTH_AUTHORIZATION_BLOCKED`). Stop until connected.
- **Do not confuse OrgCS with demo orgs.** `salesforce-sobject-all` and `sf-service-assistant` point at trial/SDO orgs, not OrgCS. Only the `orgcs`-prefixed MCP tools read real case data. Verify with `getUserInfo` (OrgCS) — the username should end in `@orgcs.com`.

### 0.2 — Slack MCP (for the alert)
Confirm `slack` shows `✓ Connected`. If not, deliver the report in the terminal instead and note the alert was skipped.

---

## Inputs (all optional — sensible defaults)

| Input | Default | Notes |
|---|---|---|
| **Threshold** | 2 business days | "more than N business days" with no customer response |
| **Owner** | the current OrgCS user | from `getUserInfo`; can target another owner/queue if asked |
| **Alert destination** | the user's own Slack DM | `channel_id` = the user's Slack user_id |
| **Deliver alert?** | yes | if Slack is down or the user says "just show me", print only |

---

## Step 1 — Identify the user

Call `getUserInfo` (OrgCS MCP). Capture:
- `userId` → the case owner filter
- `timeZoneIana` → use this timezone for all business-day math
- confirm `username` ends in `@orgcs.com` (proves we're on OrgCS, not a demo org)

## Step 2 — Pull open, waiting-on-customer cases

```soql
SELECT CaseNumber, Id, Subject, Status, Sub_Status__c,
       Account.Name, ContactEmail, Age_days__c, LastModifiedDate
FROM Case
WHERE OwnerId = '<userId>'
  AND IsClosed = false
  AND (Status IN ('Waiting on Customer','Waiting on Customer - OOO')
       OR Sub_Status__c = 'Waiting on Customer')
ORDER BY LastModifiedDate ASC
LIMIT 200
```

This mirrors the *Success Guide Open Cases* list view (owner + open + waiting-on-customer).

> **Known data gap (verified May 2026):** the rollup fields `Last_Public_Activity_Date_Time__c`, `Last_Support_Update__c`, `Unresponsive_Follow_ups__c`, and `Next_Follow_up_Date__c` are **null/0 in OrgCS** — do not rely on them. The **email thread (Step 3a) is the source of truth for the customer's last response**, and **internal `CaseComment` records (Step 3b) are the source of truth for the Guide's own activity / next steps**. Read both.

If zero rows: report "No open cases waiting on a customer — you're clear." and stop.

## Step 3 — Find the real last activity per case (email thread + internal comments)

### Step 3a — Customer/support email thread (read the latest outbound BODY)

For all case Ids from Step 2, bulk-pull the thread metadata:

```soql
SELECT ParentId, Incoming, MessageDate, FromAddress, Subject
FROM EmailMessage
WHERE ParentId IN (<case Ids>)
ORDER BY MessageDate DESC
```

`Incoming = true` → message **from the customer**. `Incoming = false` → **outbound from support** (typically a shared address like `customersupport@salesforce.com` — which is exactly why this mail never appears in your personal Gmail).

Then, for each case with an outbound message, **read the BODY of the latest outbound** — knowing *that* an email exists isn't enough; you need to know *what it said*. A "send the resources" action is already **done** if that body contains them, so this is what stops a duplicate follow-up:

```soql
SELECT TextBody, MessageDate, Subject
FROM EmailMessage
WHERE ParentId = '<caseId>' AND Incoming = false
ORDER BY MessageDate DESC
LIMIT 1
```

If any INBOUND message is newer than that latest outbound, the customer has replied — the ball is back in our court (not theirs).

### Step 3b — Internal case comments (the Guide's own activity / next steps)

Email alone misses progress the Guide logs as **internal notes** — e.g. "AE scheduled call for Thursday 2pm." Pull `CaseComment` for the same case Ids:

```soql
SELECT ParentId, CommentBody, IsPublished, CreatedDate, CreatedById, CreatedBy.Name
FROM CaseComment
WHERE ParentId IN (<case Ids>)
ORDER BY CreatedDate DESC
```

- `IsPublished = false` → **internal note** (not customer-visible). These still count as **case activity** and as evidence of a **next step**.
- A comment authored by the **case owner** (the Guide, from Step 1 `userId`) within the threshold means the case is *actively handled*, even if the customer email thread is quiet.
- Scan the most recent comment body for an explicit **next step / scheduled action** (e.g. "call …", "scheduled …", "meeting …", "<weekday> at <time>", "booked", "follow up <date>"). Capture that text — it both *suppresses closure* (Step 5) and *gets surfaced* in the output (Step 6).
- The comment feed is also where the Guide **mirrors each outbound email** (often with an `EmailMessage` link), and pastes the **AE/case Slack channel link**, canvas links, and to-do notes. **Harvest the Slack channel link from here** rather than guessing or searching — it's the authoritative pointer to the case's AE side-channel, and it confirms who's already been looped in before you recommend a nudge.

> `CaseComment` is fully readable via the OrgCS MCP. The Chatter-style `FeedItem` feed is **not** bulk-queryable (`FeedItem requires a filter by Id`), so it isn't used here — `CaseComment` covers internal notes for this skill.

## Step 4 — Classify each case

For each case, compute **two clocks** (see Purpose):

- **Customer-silence clock** — from the most recent EmailMessage (Step 3a).
- **Case-activity clock** — from `last_touch` = the **later of** {most recent outbound `EmailMessage.MessageDate`, most recent `CaseComment.CreatedDate` by the case owner from Step 3b}.

| Most recent **email** | Meaning | Customer silent? |
|---|---|---|
| `Incoming = false` (support sent last) **and** `MessageDate` > N business days ago | We reached out; customer silent since | **Yes** |
| `Incoming = false` but within N business days | We just followed up; clock reset | No |
| `Incoming = true` (customer replied last) | Ball is in our court, not theirs | No (ball in our court) |
| No emails at all | No thread to judge | Flag separately as "no email thread — check manually" |

**Then apply the activity override:** if the customer is silent **but** there is a recent **case comment by the owner** (within threshold) — especially one naming a **next step / scheduled action** — the case is **actively handled**. It is **not** a chase/closure candidate; route it to ✅ on-track and carry the note text forward.

**Business-day math:** count back from *now* in the user's timezone, skipping Saturdays and Sundays. (Holidays are not handled in v1 — note that caveat if it matters.) Example: from Monday, 2 business days back is the prior Thursday.

Compute `business days stalled` = business days between the last outbound `MessageDate` and now. Compute `business days since last_touch` separately — that's the one that governs whether the case is genuinely idle.

## Step 5 — Tier each case: ASAP vs. OK

The output must answer two things at a glance: **what must I fix ASAP today**, and **what's the status of the rest**. So split the flagged cases into two tiers.

**🔴 Needs attention today (ASAP)** — a case lands here if **any** of these is true:
- **Hard deadline today** — an SLO / committed next-action is due today or already breached. Always sorts to the very top.
- **Old & at closure risk** — `Age_days__c` ≥ 30 **and** customer silent past threshold. Candidate to chase hard or close.
- **Long silence** — customer silent **≥ 4 business days** (regardless of total age).

> **Activity override (apply BEFORE tiering):** if a case would land in ASAP *only* because the customer is silent, but Step 3b shows a recent owner comment with a **next step already in motion** (a scheduled call/meeting, a booked follow-up), do **NOT** put it in ASAP and do **NOT** recommend closure. Move it to ✅ on-track with the note surfaced. The "hard deadline today" trigger is **not** overridden — a due/breached SLO is always ASAP regardless of internal notes.

**✅ OK / on track** — everything else: stalled but under the ASAP thresholds, cases you just followed up on (clock reset, within threshold), cases where the customer replied last, **or cases that are customer-quiet but actively handled per a recent internal note** (show the next step, e.g. "internal note 6/8: AE call booked Thu 2pm"). List these compactly below so nothing looks missed, but they need no action today.

Sort the ASAP tier by urgency: deadline-today first, then most business-days stalled, then oldest age.

**For every ASAP case, attach a one-line instruction** — concrete and specific, e.g.:
- deadline breached → "⏰ Respond/ack now — SLO due/overdue."
- 30+ days & silent **and no next step logged** → "Chase today, or move to *Closed – No response from Customer* if no path forward."
- 4+ biz days silent **and no next step logged** → "Send a follow-up nudge to the customer."
- (If a next step *is* logged, it shouldn't be in this tier — see the activity override.)

## Step 6 — Present & send

Lead with the ASAP tier, then the OK tier. Same structure in the terminal and in Slack:

```
🔴 Needs attention today — as of <date, user TZ> (threshold >N biz days)
- <Case #> · <Account> · <why ASAP: deadline / 30d+ / 4+ biz days silent> · Age <d>d
  → <one-line instruction on what to do>
- ...

✅ OK / on track (no action today)
- <Case #> · <Account> · <stalled Nd but under threshold / just followed up / customer replied last / customer-quiet but handled — "internal note <date>: <next step>">
- ...
```

When a case is on-track *because* of a logged next step, show that note inline (date + the action) so it's clear why it isn't being chased — e.g. `<Case#> · <Account> · customer quiet 6 biz days, but internal note 6/8: AE <AE name> call booked Thu 2pm → on track`.

Unless the user opted out, send a DM to **their own Slack** (`channel_id` = the user's Slack user_id; from `slack_user_id` in `~/.claude/profile.md` — if unset, look up with `slack_search_users`). Use a `:rotating_light:`-style header, the as-of date, and the same two-tier layout. Return the message link.

If **no** ASAP cases: send a short "✅ All caught up — no cases need attention today." followed by the OK list for awareness (or skip the DM if the user prefers alerts only). If there are **zero** open waiting-on-customer cases at all, just send the all-clear.

> **Slack formatting note:** the Slack MCP renders markdown into blocks and rejects some input as `invalid_blocks` — most often a **bare URL on its own line**. Always wrap links as `<https://…|label>`. Keep bold to `*single asterisks*` and avoid stray characters that can be parsed as a table.

---

## Output Standards

- Lead with the **🔴 Needs attention today** tier (each with an instruction), then the **✅ OK / on track** list; never dump raw SOQL/JSON.
- Always state the as-of date and timezone, and the threshold used.
- Never invoke any write — this is read + alert only. If the user asks to send follow-ups or change status, explain it must be done in the OrgCS UI (read-only MCP).
- Respect CSG/Claude data-handling guidelines before putting case content anywhere external.

## Known Limitations

| Limitation | Status | Workaround |
|---|---|---|
| OrgCS MCP is read-only | By design | Detect + alert only; act in the OrgCS UI |
| Rollup activity fields are null in OrgCS | Verified May 2026 | Use the EmailMessage thread (Step 3a) + `CaseComment` (Step 3b) |
| Internal progress lived only in case comments, so customer-quiet cases looked dead | Fixed v1.1 (2026-06-09) | Step 3b reads `CaseComment`; activity override keeps actively-handled cases out of ASAP/closure |
| Reading only email *metadata* (not the body) surfaced "send resources" chases for cases where the resources were already sent | Fixed v1.2 (2026-07-15) | Step 3a reads the latest outbound `TextBody`; Step 3b harvests the AE/case Slack channel link from the comment feed; never infer "unsent" from personal Gmail or age |
| `FeedItem` (Chatter feed) not bulk-queryable | Platform (`requires a filter by Id`) | Use `CaseComment` for internal notes; per-record feed reads only if needed |
| Business-day math ignores holidays | v1 | Note it; treat borderline cases as advisory |
| Non-email channels (chat, phone) not counted | v1 | Email thread is the primary signal; mention if a case has no email thread |
| OrgCS auth token is short-lived | Platform | If queries 401, re-authenticate via `/mcp` (orgcs custom domain) |
