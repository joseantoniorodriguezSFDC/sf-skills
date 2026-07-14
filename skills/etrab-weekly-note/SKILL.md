---
name: etrab-weekly-note
description: For every active engagement the Success Guide owns (the "My Active Playbooks" list view — ETRAB and all other programs), read the prior Engagement Task note plus context from the engagement's Slack channel, any linked case email thread, and the SG's Gmail, then produce a ready-to-paste weekly note per account that is a true follow-on to the last note — using the standard account-note template (DATE / AT RISK? / OVERALL HEALTH / CUSTOMER SENTIMENT / UPDATE / CUSTOMER BLOCKERS / PRODUCT GAP / NEXT STEPS). Read-only — produces draft notes for the SG to paste into the Engagement Task's Notes field; never writes to Salesforce.
---

> **⚙️ Setup:** This skill reads your context (workspace email, timezone, Slack id, org, weekly-note canvas) from `~/.claude/profile.md`. Run `/setup-profile` once after cloning — it auto-detects those and writes the profile. No need to edit this file.

# ETRAB Weekly / Today Note — Per-Account Status Notes

## Purpose

Produce a **ready-to-paste account note for today** for **every active engagement** the Success Guide owns — so the SG can log a current status note on each engagement (the weekly update kept in the Engagement Task's **Notes** field). Each note is built as a **follow-on to the prior note**, carrying forward the last DATE's blockers / next steps and surfacing what changed.

For each active engagement, the skill reads the prior note plus signals from three live sources, then writes a note in the standard template:
0. The engagement's **prior Engagement Task note** (`csc__Playbook_Task__c.csc__Notes__c`) — the last logged status; the new note continues from it.
1. The engagement's **linked Slack channel** (`ZC:<id>:<Name>` convention) — who said what, latest activity.
2. Any **linked case email thread** (customer replies that came by email).
3. The SG's **Gmail** — customer outreach, replies, calendar invites/cancellations tied to the account.

> **ETRAB = "Easy to Resolve AI Blockers"** — one Agentforce-adoption program among the engagements. This skill is **not** limited to ETRAB; it covers all active engagements (the *My Active Playbooks* list view). See [[etrab-engagement-skill]] and [[etrab-adoption-plan-skill]].

> **Read-only.** OrgCS MCP is read-only ([[orgcs-mcp-readonly]]); this skill only reads. The output is **draft notes** the SG reviews and pastes themselves. It never writes to Salesforce and never sends Slack/email.

> **⚙️ Performance / subagent discipline.** Steps 2–2.5 are **bulk queries** (one SOQL per object across all engagement Ids, `WHERE … IN (<ids>)`) — never one query per engagement. The only place this skill fans out to subagents is the **cron path with > 3 engagements** (Step 9) — genuinely *many-and-parallel* per-engagement source reads. **Interactive runs stay inline** (you're present, want to watch it, and are usually scoping to one or a few engagements). See [[feedback-subagent-discipline]].

---

## Prerequisites

### 0.1 — OrgCS MCP connected
`claude mcp list` → **`orgcs`** shows `✓ Connected`. If missing/`Needs authentication`, authenticate at `/mcp` via the **orgcs custom domain** (a normal login throws `OAUTH_AUTHORIZATION_BLOCKED`). Verify with `getUserInfo` (username ends in `@orgcs.com`). See [[sf-mcp-org-mapping]] — `orgcs` is the real read-only support org.

### 0.2 — Slack MCP connected
`slack` shows `✓ Connected` (needed to read engagement channels, which are private — the Slack MCP user must be a member).

### 0.3 — Google Workspace MCP connected
The `google-workspace` plugin server is connected for Gmail context (mailbox = `workspace_email` from `~/.claude/profile.md`). If it shows a "connection reset by peer" error, that's the gateway — `/mcp reconnect` (not re-auth). See [[gworkspace-mcp-gateway-outage]] and [[personal-productivity-skills]]. If Gmail is down, proceed with Slack + case email only and note Gmail was skipped.

---

## Inputs (all optional — sensible defaults)

| Input | Default | Notes |
|---|---|---|
| **Engagement scope** | all **active** playbooks owned by the user (*My Active Playbooks*) | not closed/canceled — see Step 2 |
| **Owner** | current OrgCS user (`getUserInfo`) | can target another owner if asked |
| **Note date** | today, in the user's timezone | format **DD/MM** (e.g. `10/06`) to match the template |
| **Single account** | — | the user can ask for just one (e.g. "just Acme") |

---

## Step 1 — Identify the user
Call `getUserInfo` (OrgCS). Capture `userId` (owner filter) and the **`userTimeAndLocale.timeZoneIana`** (the user's own tz — used for "today's" date and any business-day math). Confirm `username` ends in `@orgcs.com`.

## Step 2 — Pull active engagements (My Active Playbooks)

```soql
SELECT Id, Name, Program__c, csc__Playbook_Status__c, csc__Stage__c,
       csc__Account__c, csc__Account__r.Name, Engagement_ID__c,
       csc__Description__c, LastModifiedDate,
       cssf_Catalog_from_Asset_Line_Item_ali__c, cssf_Success_Plan_Name__c
FROM csc__Playbook__c
WHERE OwnerId = '<userId>'
  AND csc__Stage__c != 'Closed'
  AND (NOT csc__Playbook_Status__c LIKE 'Canceled%')
ORDER BY LastModifiedDate DESC
LIMIT 200
```

Notes:
- Approximates the **My Active Playbooks** list view (owner = me, not closed, not canceled).
- `Program__c` is free-text and usually **null** — don't filter on it. ETRAB engagements are simply named `<Account> ETRAB …`.
- The Slack link in `csc__Description__c` is the generic process-guide canvas — **NOT** the engagement channel. Ignore it for channel discovery.
- **`cssf_Catalog_from_Asset_Line_Item_ali__c`** (label *"Catalog from Asset Line Item"*) is the **success plan tier** the customer actually owns — typically `Premier` or `Signature`. This drives the **CSM-expectation rule** (Step 7 field guidance). The other catalog fields are unreliable: `cssf_Catalog__c` defaults to `Signature` on most engagements regardless of the real plan, and `cssf_Catalog_from_Asset_Line_Item__c` is the **DNU** (Do Not Use) picklist. **Always read `cssf_Catalog_from_Asset_Line_Item_ali__c`.**
- If zero rows: report "No active engagements found." and stop.

## Step 2.5 — Pull the prior Engagement Task note (the last logged status)

The weekly status note lives on the **Engagement Task** object `csc__Playbook_Task__c` (linked to the engagement via `csc__Playbook__c`), in the **Notes** field `csc__Notes__c` (rich text / HTML, 32 KB). The recurring task is typically named **"Weekly Agent Updates"**. This is the same template the SG uses (DATE / AT RISK? / OVERALL HEALTH / …), so the new note must **continue from it**, not start blank.

```soql
SELECT Id, Name, csc__Status__c, csc__Completed__c, Priority__c, Category__c,
       csc__End_Date__c, csc__Notes__c, csc__Description__c, cssf_Comment__c,
       cssf_Call_to_Action_Notes__c, LastModifiedDate
FROM csc__Playbook_Task__c
WHERE csc__Playbook__c = '<playbookId>'
ORDER BY csc__End_Date__c NULLS LAST, CreatedDate DESC
```

For each engagement:
- Pick the most relevant task (prefer the open **"Weekly Agent Updates"** task; otherwise the most recently modified non-template task — `csc__Is_Template__c = false`).
- **Parse `csc__Notes__c` as HTML** (strip `<p>`, `<br>`, decode entities like `&#39;`). Extract the prior **DATE** and each template field's last value (AT RISK?, OVERALL HEALTH, CUSTOMER SENTIMENT, CUSTOMER BLOCKERS, PRODUCT GAP, NEXT STEPS).
- Keep the prior **NEXT STEPS** and **CUSTOMER BLOCKERS** — the live sources (Steps 3–6) tell you which were resolved, which persist, and what's new.
- Note the prior task `Category__c` (often a `Barrier: …` value) and `Priority__c` — useful signal for the new note's blockers/health.
- If there's **no task / empty Notes**, say so and build a fresh note (this is the first entry).

## Step 3 — Per engagement, find the Slack channel
Channels follow **`ZC:<channelId>:<Engagement Name>`** (private, created when the engagement spins up). For each engagement call `slack_search_channels` (`channel_types: "public_channel,private_channel"`) with a distinctive token (account name / engagement name). Match the result whose name equals the engagement `Name` after the second colon; the **channel ID is the middle colon-segment** (e.g. `#ZC:<CHANNEL_ID>:Acme Corp ETRAB` → `<CHANNEL_ID>`). If several match, prefer the exact full-name match created by the SG. If none: note "no linked Slack channel — check manually" and continue.

## Step 4 — Read the channel & extract signal
`slack_read_channel` (newest first, `limit` ~30). **Ignore non-substantive messages**: join/leave system msgs, Slackbot channel-conversion notices, bot/agent auto-joins (e.g. *Account Success Employee Agent*). Read threads (`slack_read_thread`) when a substantive message has replies. Capture:
- **Latest substantive activity** and **who** (AE/CSM/customer vs. the SG) — is the ball in our court or theirs?
- **Account context** AEs/CSMs posted (handoff notes, pain points, contacts, contract/credit details).
- **Blockers** mentioned (technical, governance, licensing, paperwork like an unsigned courtesy success plan).
- **Scheduling state** (sessions booked/moved/cancelled).

## Step 5 — Customer emails sent FROM OrgCS (primary email signal)

When the SG composes an email from inside the OrgCS engagement page (the "Email" tab on the engagement record), OrgCS persists the message as a **Task** record (`TaskSubtype = 'Email'`, `Status = 'Completed'`) tied to the engagement via `WhatId`. The full subject, recipients (To/CC/BCC), attachment list, and **body** all live in the `Task.Description` field as plain text.

This is the **primary** email signal for ETRAB engagements — the Gmail MCP only mirrors what's in the SG's personal Gmail and is currently subject to the `-32000` gateway outage; OrgCS-sent emails are *always* readable here even when Gmail is down.

```soql
SELECT Id, Subject, ActivityDate, CreatedDate, WhoId, WhatId, Status,
       TaskSubtype, Type, Description
FROM Task
WHERE WhatId = '<playbookId>'
  AND TaskSubtype = 'Email'
ORDER BY CreatedDate DESC
LIMIT 20
```

Parse `Description` to extract `To:`, `CC:`, `Subject:`, and `Body:` lines — the format is consistent across OrgCS-sent emails (it's a structured plain-text dump). The body is what the SG actually wrote; in the canvas/note, quote a 1–2 sentence excerpt verbatim plus a `📨 Email sent (verbatim from OrgCS Task)` note pointing at the Task ID. Use `CreatedDate` (UTC) to land the dated UPDATE entry.

### Linked case email thread (secondary, for replies)
```soql
SELECT Id, CaseNumber FROM Case WHERE Engagement__c = '<playbookId>'
```
```soql
SELECT ParentId, Incoming, MessageDate, FromAddress, Subject, TextBody
FROM EmailMessage WHERE ParentId IN (<case Ids>) ORDER BY MessageDate DESC
```
`Incoming = true` → customer emailed. Often there are **no linked cases** for these engagements (verified Jun 2026) — that's fine; the OrgCS Task records above plus Gmail (Step 6) cover the email signal.

## Step 6 — Gmail context
Search the SG's mailbox for customer threads, replies, and calendar events tied to each account:
```
search_gmail_messages: (<Account1> OR <Account2> OR …) newer_than:45d
```
Then `get_gmail_messages_content_batch` on the hits. Look for: the SG's intro/outreach email and whether the **customer replied**; **calendar invites / cancellations** (booked, moved, cancelled sessions); engagement-assignment notices; folders/docs shared. Match each thread back to its account by name/contact/domain. Watch for **a second engagement** for the same account that isn't in the active list — surface it for the SG to reconcile.

## Step 7 — Synthesize one note per engagement (a follow-on to the prior note)

Fill every field from the gathered signals, **anchored to the prior note from Step 2.5**. Use **DD/MM** for the date (today). The new note continues the story:
- **UPDATE** — this is a *weekly* update covering the **last 7 days (Friday → Thursday)**. **Format as a chronological dated log, NOT a paragraph.** Each substantive day gets its own line:
  ```
  UPDATE:
  12/06: <what happened that day — who said what, sessions, emails, artifacts shared>

  15/06: <next dated entry>

  17/06: <next dated entry>
  ```
  Rules:
  - **Never use "TODAY", "yesterday", "earlier today", "this week"** in the UPDATE body. Every event must be anchored to its absolute **DD/MM**. The reader (and the SG, weeks later) shouldn't need today's date to understand the note.
  - One blank line between dated entries — makes it scannable.
  - Each line covers one day's substantive activity: Slack messages, emails, customer/AE/CSM interactions, sessions held/booked/cancelled, artifacts shared (canvas, doc, deck), stakeholder changes (people joining, new contacts).
  - Skip days with no signal — don't pad. 3–6 dated entries is normal for an active engagement; 1–2 for a quiet week.
  - Pre-Friday context only if it's load-bearing for reading the week (e.g., "Premier courtesy approved earlier; verbal accept on Mon"); otherwise stay inside Fri→Thu.
  - If the week was silent: write `UPDATE: No new activity since prior note (DD/MM); channel/email silent.` — single line, no dated entries.
- **CUSTOMER BLOCKERS / NEXT STEPS** — carry forward the prior items, then mark each: ✅ resolved, ⏳ still open, or ➕ new (based on Steps 3–6). Drop resolved ones from the live list but mention the resolution in the relevant dated UPDATE entry.
- **AT RISK? / OVERALL HEALTH / SENTIMENT** — if these changed from the prior note, the update should make the reason explicit (e.g. "moved from EARLY to BLOCKED because …").
- If there was **no prior note**, build a fresh one and say it's the first entry.

```
DATE: <DD/MM>

AT RISK? <YES | NO>

OVERALL HEALTH: <STATUS> — <one-line rationale grounded in the signals>

CUSTOMER SENTIMENT: <SENTIMENT> — <basis; say if it's read off the AE/account, not the customer>

UPDATE:
<DD/MM>: <what happened that day>

<DD/MM>: <next dated entry>

<DD/MM>: <next dated entry>

CUSTOMER BLOCKERS: <technical / governance / licensing / paperwork blockers, or "None identified yet (pre-discovery)">

PRODUCT GAP: <NA, or the specific product limitation observed>

NEXT STEPS: <the next 1–2 concrete actions>
```

Field guidance:
- **AT RISK?** `YES` only on a real churn/renewal/confidence signal (e.g. poor results + near contract expiry). Early/pre-discovery engagements are `NO`.
- **OVERALL HEALTH** — pick a status word and justify it: `AT RISK`, `BLOCKED` (paperwork or hard dependency stopping start), `IN PROGRESS`, `EARLY / AWAITING CUSTOMER`, `EARLY / ON TRACK`, `ON TRACK`.
- **CUSTOMER SENTIMENT** — `FRUSTRATED / CONCERNED / NEUTRAL / ENGAGED / POSITIVE`. **Be honest about the source:** most engagements haven't had a *customer* meeting yet, so sentiment is read off the AE/CSM and account signals — label it `NEUTRAL — no direct customer contact yet` rather than inventing customer mood.
- **PRODUCT GAP** — `NA` unless a concrete product limitation surfaced (e.g. Command Center not surfacing the auto-open widget option).
- **Success-plan tier rule (Premier vs. Signature) — affects what counts as a blocker.** Read `cssf_Catalog_from_Asset_Line_Item_ali__c` from Step 2:
  - **Premier accounts NEVER have a CSM** — only Signature accounts do. So **never list "no CSM identified" as a CUSTOMER BLOCKER or NEXT STEP on a Premier engagement** — that's the expected coverage model, not a gap. The SG (and AE) are the customer's coverage. If the prior note carried "no CSM" as a blocker on a Premier engagement, **drop it** and note in UPDATE that it was removed because the account is on Premier.
  - **On Signature accounts, "no CSM identified" IS a real blocker** — keep it open and put a NEXT STEP on identifying / engaging the CSM with a name + DD/MM date.
  - When in doubt or the field is null, label it `<tier unknown — verify>` rather than guessing.
  - Mention the tier explicitly once per note when it's load-bearing for the read (e.g., in UPDATE: "Premier account — SG-led coverage, no CSM expected.").
- **NEXT STEPS** — every item must be **specific, actionable, and accountable**. Each step needs all four:
  - **Owner** (named person — the SG, the AE by name, the customer contact by name; never "the team")
  - **The action itself, concrete** — not "follow up with <AE name>" but "nudge <AE name> in Slack asking for (a) signature ETA on the Premier courtesy plan and (b) a 30-min alignment slot this week"
  - **A target date in DD/MM** — never "EOW" or "next week"
  - **The trigger / dependency** when relevant — what unblocks the step or what happens if it slips ("if no reply by 15/06, escalate to <manager name>")
  Aim for 3–6 next steps that cover: (1) the very next outbound action, (2) what the SG does if step 1 doesn't move, (3) any parallel actions other people own, (4) the next checkpoint or decision date. A note with one vague bullet ("the SG to follow up") is a failure mode — rewrite it.
- Convert relative dates ("yesterday", "this week") to **absolute DD/MM** in the note.

## Step 8 — Present, tiered

Lead with engagements that need attention today, then the rest. For each, a one-line headline above the paste-ready block.

```
🔴 Needs attention today
### <Account> — <Engagement Name> (<ENG-id>)
<one-line headline of why>
```<note block>```

🟡 In progress / scheduling
### <Account> — <Engagement Name> (<ENG-id>)
<one-line headline>
Since last note (<prior DD/MM>): <one line — what changed>
```<note block>```
```

Above each note block, add a one-line **"Since last note (\<prior DD/MM\>): …"** diff so the SG sees what moved (resolved blockers, status change, new activity). If it's the first entry, write "Since last note: first entry."

A note lands in **🔴** if: AT RISK = YES, OVERALL HEALTH = BLOCKED/AT RISK, someone replied and the ball is in the SG's court, a session is happening today, or no channel was found. Everything else goes in **🟡 / ✅**.

End with a short **verify-before-logging** list: which fields are inferred (especially any `AT RISK?`/sentiment read off handoff notes rather than the customer), and any **duplicate/extra engagement** found in Gmail that wasn't in the active list.

**Where to paste:** each note goes into the engagement's **"Weekly Agent Updates"** Engagement Task → **Notes** field (`csc__Notes__c`). It's a rich-text field, so pasting the plain note renders fine.

> **⚠️ Write-back is not possible.** The `orgcs` MCP is **read-only** (endpoint `sobject-reads`; no create/update tools). The write-capable MCP orgs (`salesforce-sobject-all`, `sf-service-assistant`) are **different demo/SDO orgs**, not orgcs ([[sf-mcp-org-mapping]]). So the skill **cannot replace the note on the task itself** — it produces the new note and the SG pastes it (replacing the prior content). If an orgcs *write*-enabled MCP is added later, Step 8 can be extended to `updateSobjectRecord` on `csc__Playbook_Task__c.csc__Notes__c`.

## Step 8.5 — Update the persistent ETRAB Weekly canvas (mandatory every run)

There is **one persistent Slack Canvas** that is the single source of truth for actionable items + recommended Stage across all of the SG's engagements:
- **Title:** *ETRAB Weekly — Actionable Items & Stage Recommendations*
- **Canvas:** `weekly_note_canvas_url` from `~/.claude/profile.md` (its canvas id is the last path segment of that URL). Set it once via `/setup-profile`.
- See [[etrab-weekly-canvas]].

**On every run** (interactive or cron), after the per-engagement notes are built (canvas id = the last path segment of `weekly_note_canvas_url` from `~/.claude/profile.md`):
1. Call `slack_read_canvas` on that canvas id to load the existing structure + section IDs.
2. Build a fresh full canvas body in the same template (header with timestamp, one section per active engagement with checklist + recommended Stage + rationale, the Stage-flip table, the cadence + verify lines).
3. Call `slack_update_canvas(canvas_id=<that id>, action="replace", content=<new body>)` **without** a `section_id` — i.e. full replacement is intentional here, because the canvas is regenerated each week. (Slack keeps prior versions in canvas history, so this is safe.)
4. After updating, the DM to the SG should include a one-liner pointing to the canvas — e.g. `Canvas updated → <weekly_note_canvas_url|ETRAB Weekly Canvas>`.

**Per-engagement Stage recommendation (drives the canvas's Stage table).** For each engagement, evaluate the live signals and recommend one of NEW / QUALIFICATION / DELIVERY / CLOSED. Heuristic:
- **NEW** — engagement record just created, AE not yet reachable, no internal alignment call held.
- **QUALIFICATION** — AE/CSM aligned, scope sketched, but no customer-facing call held yet (or a customer email/invite is in flight). Most ETRAB engagements sit here for 1–2 weeks.
- **DELIVERY** — first customer call has been held; sessions are running; the SG has a working plan and the customer is engaged.
- **CLOSED** — success criteria met OR engagement is duplicate/superseded by a parallel SG engagement.

Each engagement's canvas section must include: *Current Stage* (read off `csc__Stage__c`), *Recommended Stage*, a one-line **rationale**, and the trigger that would advance it. The Stage-flip table at the bottom of the canvas summarizes all engagements.

If the canvas read returns "not found" / 404 (rare — someone deleted it), recreate via `slack_create_canvas` with the same title and update the canvas-id memory file.

## Step 9 — Unattended / scheduled mode (Thursday midday cron)

When run from the **weekly cron** (Thursdays ~12:40 PM in your `timezone` from `~/.claude/profile.md`), there's no human present, so the skill switches to **report-and-deliver** mode:
- Run **STEP 0 OrgCS auth pre-check** first (`getUserInfo` on orgcs). If it fails/401/empty: do **not** silently fail — send a Slack DM saying "⚠️ OrgCS not authenticated — re-auth at /mcp (orgcs custom domain); weekly notes skipped this run." and stop.
- Process **all active engagements** — but **gate the fan-out on count** (this is the *many-and-parallel* rule; don't pay spawn overhead when there's nothing to parallelize):
  - **≤ 3 engagements → stay inline**, processing them sequentially. A single subagent per engagement here is slower and costs more tokens than just doing it in the main thread.
  - **> 3 engagements → fan out one subagent per engagement** (each does Slack read + Gmail + prior-note parse and returns *only* the finished note + its "Since last note" diff), spawned in a single message so they run concurrently. This is the case where parallelism genuinely saves wall-clock and each helper's noisy source-reading stays out of the main thread. **Time-box** each to ~3 min and note any that didn't return rather than blocking the whole run.
  - Either way the synthesis (Step 7), tiering (Step 8) and the canvas update (Step 8.5) happen **once, inline** — they need every engagement's result together, so they're not parallelizable.
- Deliver **one Slack DM** to the SG (`channel_id` = `slack_user_id` from `~/.claude/profile.md`) via `slack_send_message`, containing every engagement's follow-on note as a fenced code block, each preceded by its **"Since last note (…)"** diff and the engagement name + ENG-id, tiered 🔴 then 🟡/✅.
- **Update the persistent ETRAB Weekly canvas** (`weekly_note_canvas_url` from your profile) per Step 8.5 — `slack_read_canvas` then `slack_update_canvas` with `action="replace"` (no section_id, full body replace). Include the canvas URL in the DM header.
- **Outbound action is limited to that single DM + the canvas update.** Do NOT post in any engagement channel, do NOT send nudges, do NOT write to Salesforce — this skill only reports; nudging is the separate [[etrab-engagement-skill]] motion in the twice-daily digest.
- **Slack formatting:** wrap every link as `<https://…|label>`, use `*single-asterisk*` bold (not `**`), and avoid bare URLs on their own line / table-like text (these trigger `invalid_blocks`). The note bodies normally have no URLs — keep them plain inside the code fence so the SG can copy-paste straight into each task.
- Slack here is **outbound-only** — a DM reply can't reach Claude ([[twice-daily-digest-cron]]), so the DM is the deliverable; the SG pastes each note into its "Weekly Agent Updates" task himself.

---

## Output Standards
- Each note in its own **code block** so the SG can copy-paste cleanly. **No `>` blockquotes** anywhere — the `▎` marker breaks copy-paste ([[draft-formatting-no-blockquotes]]).
- Never dump raw SOQL/JSON or full email bodies — synthesize.
- Read-only on OrgCS; **no Slack/email is sent** and **nothing is written to Salesforce**. The SG pastes the notes themselves. Respect CSG/Claude data-handling guidelines for customer content.
- Faithfully label inference vs. fact; if a source was skipped (e.g. Gmail down), say so in the note.

## Known Limitations
| Limitation | Status | Workaround |
|---|---|---|
| Channel discovery relies on the `ZC:<id>:<Name>` convention | By design | If no match, note "channel not found — check manually" |
| Engagement channels are private | Platform | The Slack MCP user must be a member to read them |
| These engagements often have no linked Case | Observed | Use Gmail (Step 6) as the email signal |
| Sentiment is inferred when no customer meeting has happened | v1 | Label it `NEUTRAL — no direct customer contact yet` |
| A second engagement for the same account may exist outside the active list | Observed | Surface it for the SG to reconcile |
| Prior note lives in `csc__Notes__c` as **HTML** | Platform | Parse/strip tags + decode entities before reading the last values |
| Cannot write the new note back to the Engagement Task | OrgCS MCP is read-only | SG pastes the note into the "Weekly Agent Updates" task's Notes field |
| The recurring task name may vary (not always "Weekly Agent Updates") | Observed | Fall back to the most recently modified non-template `csc__Playbook_Task__c` |
