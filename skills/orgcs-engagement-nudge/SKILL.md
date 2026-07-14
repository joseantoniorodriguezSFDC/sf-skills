---
name: orgcs-engagement-nudge
description: Check the Success Guide's active engagements (the "My Active Playbooks" list view) — has anyone replied in each engagement's linked Slack channel (and the related case email thread)? If a channel has gone quiet (nobody but the Success Guide has replied AND >2 business days since the SG's last message), draft an @here nudge for approval. Covers all active engagements, not just ETRAB. Read-only on OrgCS; the only write is a Slack nudge the user explicitly approves.
---

> **⚙️ Setup:** This skill reads your context (Slack id, workspace email, timezone, org) from `~/.claude/profile.md`. Run `/setup-profile` once after cloning — it auto-detects those and writes the profile. No need to edit this file.

# OrgCS Engagement Nudge — Adoption Follow-up

## Purpose

Answer one question per **active engagement**: **"Has anyone responded on this engagement's Slack channel yet — and if not, should I nudge them?"**

For **every active engagement** the Success Guide owns (the *My Active Playbooks* list view — ETRAB and all other programs), the skill:
1. Finds the engagement's **linked Slack channel** (by naming convention).
2. Reads the channel and decides whether **anyone other than the Success Guide has replied**.
3. Secondarily checks the **related case email thread** for a customer reply.
4. If the channel is quiet (see threshold), **drafts an `@here` nudge** and posts it **only after the user approves**.
5. Reports, per engagement, whether the ball is in our court (someone replied) or theirs (still waiting).

> **ETRAB = "Easy to Resolve AI Blockers"** — one Agentforce-adoption program among the engagements (program-wide channel `#agentforce-etrab`). This skill is **not** limited to ETRAB; it covers all active engagements.

> **OrgCS MCP is read-only.** This skill never writes to Salesforce — it only reads engagements, channels, and email threads. The *only* outbound action is a Slack nudge, and that is **draft-and-confirm by default** (never auto-broadcast). See [[orgcs-mcp-readonly]] and [[etrab-engagement-skill]].

> **⚙️ Performance / subagent discipline.** Step 2 (engagements) and Step 5 (case-email check) are **bulk queries** across all engagement Ids — not per-engagement loops. Each engagement's Slack channel read (Steps 3–4) is fast and light, so **stay inline by default**. Only the **cron path with > 3 engagements** (below) may fan out one subagent per engagement for the channel reads; a single subagent per engagement on a small run is slower and costs more than doing it inline. Interactive runs never fan out — you're present to approve each nudge. See [[feedback-subagent-discipline]].

---

## Prerequisites

### 0.1 — OrgCS MCP connected
Run `claude mcp list` and confirm an **`orgcs`** server shows `✓ Connected`. If missing / `Needs authentication`, follow the same setup as [[orgcs-mcp-readonly]] (authenticate at `/mcp` via the **orgcs custom domain** — a normal login throws `OAUTH_AUTHORIZATION_BLOCKED`). Verify with `getUserInfo` (username ends in `@orgcs.com`).

### 0.2 — Slack MCP connected
Confirm `slack` shows `✓ Connected`. Channel reads and the nudge both need it. If Slack is down, do the email-thread check only and report that the channel check + nudge were skipped.

---

## Inputs (all optional — sensible defaults)

| Input | Default | Notes |
|---|---|---|
| **Engagement scope** | all **active** playbooks owned by the user (*My Active Playbooks*) | not closed/canceled — see Step 2 |
| **Owner** | current OrgCS user (`getUserInfo`) | can target another owner if asked |
| **Quiet threshold** | nobody-but-the-SG has replied **AND** > 2 business days since the SG's last message | both conditions required |
| **Mention type** | `@here` | notifies active members only; use `@channel` only if the user asks |
| **Nudge mode** | **draft & confirm** | show the message, post only on approval. Never auto-broadcast |
| **Timezone** | the user's `timeZoneIana` from `getUserInfo` | used for all business-day math |

> To narrow a run, the user can ask for a single program (e.g. "just ETRAB" → add `AND Name LIKE '%ETRAB%'`) or a single engagement by name.

---

## Step 1 — Identify the user

Call `getUserInfo` (OrgCS). Capture `userId` (owner filter), `timeZoneIana` (use the **`userTimeAndLocale.timeZoneIana`** — the user's own tz, not the manager's), and confirm `username` ends in `@orgcs.com`. Also grab the Slack `user_id` for the alert recipient (from `slack_user_id` in `~/.claude/profile.md`; otherwise `slack_search_users`).

## Step 2 — Pull active engagements (My Active Playbooks)

```soql
SELECT Id, Name, Program__c, csc__Playbook_Status__c, csc__Stage__c,
       csc__Account__c, Engagement_ID__c, csc__Description__c, LastModifiedDate
FROM csc__Playbook__c
WHERE OwnerId = '<userId>'
  AND csc__Stage__c != 'Closed'
  AND (NOT csc__Playbook_Status__c LIKE 'Canceled%')
ORDER BY LastModifiedDate DESC
LIMIT 200
```

Notes:
- This approximates the **My Active Playbooks** list view (owner = me, not closed, not canceled). Verified Jun 2026 to return the same active set.
- The Slack link inside `csc__Description__c` is the **generic process-guide canvas** (often identical across engagements) — it is **NOT** the engagement channel. Ignore it for channel discovery.
- `Program__c` is free-text and usually **null** — don't filter on it. ETRAB engagements are simply named `<Account> ETRAB …`.

If zero rows: report "No active engagements found." and stop.

## Step 3 — Find each engagement's Slack channel (naming convention)

Engagement channels follow the pattern: **`ZC:<channelId>:<Engagement Name>`** (private channels created when the engagement spins up).

For each engagement, call `slack_search_channels` with the engagement `Name` (or a distinctive token like the account name), `channel_types: "public_channel,private_channel"`. Match the result whose name is `#ZC:<id>:<Name>` and equals the engagement `Name` after the second colon. **The channel ID is the middle colon-segment** of the channel name (e.g. `#ZC:<CHANNEL_ID>:<Account> ETRAB` → `<CHANNEL_ID>`) — and also appears in the permalink `…/archives/<CHANNEL_ID>`.

If multiple channels share a generic suffix (e.g. several `… Sales: AI & Agentforce`), prefer an exact full-name match and the one created by/most relevant to the user. If no channel matches: report "no linked Slack channel found — check manually" for that engagement and continue (still do the email-thread check in Step 5).

## Step 4 — Read the channel & classify activity

`slack_read_channel` (newest first, `limit` ~30). **Ignore non-substantive messages** when judging replies:
- join/leave system messages (`… has joined the channel`),
- Slackbot / channel-conversion notices (`USLACKBOT`),
- bot/agent auto-joins (e.g. *Account Success Employee Agent*).

Then classify the most recent **substantive human** message:

| Most recent substantive message | Meaning | Quiet? |
|---|---|---|
| From **someone other than the SG** (AE, CSM, customer, etc.) | They replied — ball is in our court | **No** — report who/when, no nudge |
| From **the SG only** (no one else has posted since) | Still waiting on the team/customer | Maybe — go to threshold check |
| No substantive messages at all | Channel just created | Treat as quiet (only system msgs) |

For the quiet case, compute **business days since the SG's last substantive message** using the user's timezone (skip Sat/Sun; holidays not handled — note as advisory on borderline).

## Step 5 — Secondary: related case email thread

Find cases tied to the engagement and check for a customer reply (this catches replies that came by email instead of Slack):

```soql
SELECT Id, CaseNumber FROM Case WHERE Engagement__c = '<playbookId>'
```
```soql
SELECT ParentId, Incoming, MessageDate, FromAddress
FROM EmailMessage WHERE ParentId IN (<case Ids>)
ORDER BY MessageDate DESC
```

`Incoming = true` → customer emailed. If a customer reply exists and is newer than the SG's last Slack post, treat the engagement as **"customer responded (by email)"** and surface it — no nudge.

## Step 6 — Decide & (if needed) draft the nudge

**Nudge only when BOTH are true:**
1. Nobody other than the SG has replied (Slack channel + email thread), **and**
2. It has been **> 2 business days** since the SG's last substantive message.

If both true → **draft** an `@here` nudge (do not send yet). Suggested template (adapt to the engagement's program/context):

```
@here Friendly nudge on the *<Engagement Name>* engagement — we're still waiting on a first
response. When you have a moment, could you share:
• Current Agentforce adoption status
• Any blockers (technical, governance, licensing)
• Goals / target use cases
Thanks! — <Success Guide name>
```

Show the draft + target channel to the user and **post only after explicit approval** (`slack_send_message` with `channel_id` = the engagement channel ID). Return the message link. If the user declines, leave it as a draft.

> Never auto-broadcast. `@everyone` only works in `#general`; in a normal channel use `@here` (default) or `@channel` if asked.

### Unattended / scheduled mode (cron digest)

When this skill runs from the **twice-daily cron digest** (no human present to approve), it switches to **auto-send with guardrails** instead of draft-and-confirm — because Slack is outbound-only here and a DM reply cannot trigger Claude; approval would otherwise be impossible.

> **Fan-out gate (cron only):** with **> 3 active engagements**, fan out one subagent per engagement for the Steps 3–4 channel reads (returning just the quiet/replied verdict + last-message timestamp), spawned in one message; **≤ 3, stay inline**. The decision on whether to nudge, and the auto-send itself, always happen **inline in the main thread** after the reads return — never inside a subagent (they can't be allowed to broadcast unreviewed).

Guardrails:
- Auto-post an `@here` nudge **only** when BOTH conditions hold: nobody but the SG has replied (Slack + case email) **and** it has been **strictly > 2 business days** since the SG's last substantive message in the channel.
- **`@here` only** — never `@channel`/`@everyone`.
- **No double-nudging:** skip if the most recent substantive message is already an SG nudge. (The >2-business-day rule enforces this naturally, since posting a nudge resets the SG's last-message time — keep it as a hard backstop.)
- If anyone replied, **do not** nudge — surface it for the SG to follow up.
- The digest must **report every auto-sent nudge** (engagement, channel, message link) so the SG has a record. Manual/interactive runs keep the draft-and-confirm default.

## Step 7 — Report: ASAP vs. OK

Mirror the case-age skill's two-tier layout so the SG sees **what needs action today** before the rest. Split engagements into two tiers.

**🔴 Needs action today (ASAP)** — an engagement lands here if **any** of these is true:
- **Someone replied, ball in your court** — an AE/CSM/customer responded (Slack or case email) and is awaiting *your* follow-up.
- **Quiet & over threshold** — nobody but the SG has replied **and** > 2 business days since the SG's last message. (Interactive: nudge drafted, awaiting approval. Cron: nudge auto-sent per guardrails.)
- **Long silence** — channel silent **≥ 4 business days** with no reply: escalate, don't just re-nudge.
- **No channel found** — engagement is active but its `ZC:<id>:<Name>` channel can't be located: check/spin it up manually.

**✅ OK / on track** — quiet but **under** threshold (no action; note when it tips over), and engagements where a nudge was **already sent and it's too soon to re-nudge**. List these compactly below.

**For every ASAP engagement, attach a one-line instruction** — e.g.:
- replied, your court → "Reply to <who> — they responded <when>."
- nudge auto-sent → "Nudge sent <link> — watch for a reply."
- 4+ biz days silent → "Escalate to the AE / account team."
- no channel → "Locate or create the engagement channel."

Present (terminal and Slack) leading with the ASAP tier, then OK:

```
🔴 Engagements needing action today — as of <date, user TZ> (threshold >2 biz days)
- <Engagement> (<ENG-id>) · <why: replied / nudge sent / 4+ biz days / no channel>
  → <one-line instruction>
- ...

✅ OK / on track
- <Engagement> · quiet but under threshold (tips over <date>) / nudge recently sent — hold
- ...
```

State the as-of date, timezone, and threshold. In the cron/unattended digest, the ASAP tier must still **list every auto-sent nudge with its message link** (record-keeping per Step 6).

---

## Output Standards

- Lead with the **🔴 Needs action today** tier (each with an instruction), then the **✅ OK / on track** list; never dump raw SOQL/JSON.
- Be honest about the threshold: if an engagement is *at* but not *over* 2 business days, put it in OK and say "not yet — tips over on <date>" rather than nudging.
- Respect CSG/Claude data-handling guidelines before putting customer content anywhere external.
- The skill is read-only on OrgCS. The single write is the approved Slack nudge.

## Known Limitations

| Limitation | Status | Workaround |
|---|---|---|
| Channel discovery relies on the `ZC:<id>:<Name>` naming convention | By design | If no match, report "channel not found — check manually" |
| Engagement channels are private | Platform | The Slack MCP user must be a member to read them |
| Generic engagement names may match multiple channels | v1 | Prefer exact full-name match; flag ambiguity |
| Business-day math ignores holidays | v1 | Note it; treat borderline (exactly 2 biz days) as advisory/hold |
| Replies in non-Slack/non-email channels (call, in-person) not detected | v1 | Slack + email thread are the signals; mention if both are empty |
| `@everyone` not valid outside `#general` | Platform | Use `@here` (default) or `@channel` |
