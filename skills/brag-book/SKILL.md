---
name: brag-book
description: "Auto-populates a Success Guide's 'brag book' — a Slack canvas quantifying qualitative contributions (team assists, mentorship, mock calls, sessions delivered, content shared, skills earned) for promotion evidence. Scans Slack + a support org (OrgCS) for likely contributions since the last run and drafts entries for one-click approval, then updates the canvas and its running tally. TRIGGER when: user says 'update my brag book', 'log my assists', 'what have I contributed', 'brag book', or after they help a peer / run a session / earn a skill. DO NOT TRIGGER when: the user wants case-metric triage (that's /orgcs-case-age) or the daily digest (that's the cron)."
metadata:
  type: orchestrator
  version: "1.0"
  last_updated: "2026-07-08"
  author: "Jose Antonio Rodriguez — Success Guide"
  audience: "Success Guides building qualitative promotion evidence"
---

# Brag Book — Qualitative Contribution Tracker

> ⚙️ **Setup:** replace `<YOUR_SLACK_USER_ID>` (Slack profile → ⋯ → *Copy member ID*), `<BRAG_CANVAS_ID>` (create a canvas with the structure at the bottom, or your existing one), `<GUIDE_CHANNEL_ID>` (your team's guide channel where you share content), and `<your timezone>` (IANA, e.g. `America/New_York`).

## Purpose

Maintain a brag book that **quantifies qualitative contributions** — the half of a Success Guide promotion that isn't case metrics. It scans where your contributions leave a trace (Slack, support-org case comments), **proposes** entries you approve, and keeps the canvas + its running tally current.

> **Why it matters:** the qualitative bar rewards *quantified* impact ("mentored N people," "ran M mock calls") — not a vague "I help the team." This skill turns invisible daily help into a countable record.

> **Draft-and-confirm, never auto-write.** The skill *proposes* entries; you approve before anything lands on the canvas. The only write is the approved canvas update. It never posts to a channel or writes to Salesforce (the support-org MCP is read-only).

> **⚙️ Subagent discipline.** Runs **inline by default** — a handful of bulk Slack searches + one `CaseComment` query. Fan out **only** for a deep historical backfill (one subagent per source). Never per-contribution. See [`SUBAGENTS.md`](../../SUBAGENTS.md).

---

## The six contribution types

| Type | Where it leaves a trace | Signal to look for |
|---|---|---|
| **Team assist** | Slack threads, case comments | You answered a peer's question, unblocked a case |
| **Mentorship** | Slack DMs/threads, recurring meetings | Ongoing coaching of a new hire / peer |
| **Mock call / shadowing** | Calendar, Slack | You ran or shadowed a call for someone's ramp |
| **Session / enablement delivered** | Slack posts, Slides, recordings | You presented, demoed, ran office hours |
| **Content / docs shared** | your guide channel | You shared a doc/recording/skill |
| **Skill / cert earned** | Trailhead, your own report | You learned a new capability |

---

## Prerequisites

- **Slack MCP** `✓ Connected` (scans + canvas update). If down, present entries in the terminal and skip the write.
- **Support-org MCP** `✓ Connected` (for the case-comment assist scan). If down, run the Slack-only scan and note the gap.
- The **brag canvas** exists (`<BRAG_CANVAS_ID>`). Read it first every run — the tally + rows are the dedupe baseline.

---

## Step 0 — Anchor time + read current state

1. **Anchor "now"** via `getUserInfo` — capture `userId`, `timeZoneIana`, wall-clock. Convert "today/yesterday" to absolute DD/MM.
2. **Read the canvas** (`slack_read_canvas` on `<BRAG_CANVAS_ID>`) — existing rows + tally = the **dedupe baseline**.
3. **Scan window** = since the most recent dated entry (or last 7 days if empty). Honor an explicit window.

## Step 1 — Scan for contributions (inline, bulk)

**1a — Slack assists & content shares.** Search messages *authored by you* (`<YOUR_SLACK_USER_ID>`) in-window: posts in `<GUIDE_CHANNEL_ID>` sharing docs/recordings/skills → **content shared**; substantive answers to peers → **team assist**; repeated coaching of the same person → candidate **mentorship**.

**1b — Support-org case-comment assists.** Comments you authored on cases you *don't* own:
```soql
SELECT ParentId, Parent.CaseNumber, Parent.Account.Name, CommentBody, CreatedDate
FROM CaseComment
WHERE CreatedById = '<userId>'
  AND CreatedDate >= <window start>
ORDER BY CreatedDate DESC
```
Guidance on cases where `OwnerId != userId` → **team assist**.

**1c — Sessions / mock calls (optional).** From what the user mentions or the calendar shows — confirm, don't over-infer.

**1d — Skills / certs.** From the user (no reliable Trailhead-progress MCP). Prompt: "Any skills/certs to log?"

## Step 2 — Propose entries (draft-and-confirm)

Compact table of **new entries only** (deduped), grouped by type, columns filled. Fill **impact** from evidence; leave a `?` where it needs user input — never invent. Flag low-confidence items rather than padding the count. User replies to add/edit/remove or "approve all".

## Step 3 — Update the canvas (only after approval)

`slack_update_canvas` on `<BRAG_CANVAS_ID>`: append approved rows, **recompute the Running Tally** (exact — it's the packet number), preserve everything else. Canvas markdown rules: no `####`+, `![](@U…)` users, `![](#C…)` channels, `[text](url)` links.

---

## Output Standards

- Propose, don't auto-write. Tally stays exact.
- Dedupe every run; never double-count.
- Every entry dated; impact from evidence, never invented.
- State window, timezone, sources; report MCP gaps rather than a false "nothing new."

## Known Limitations

| Limitation | Status | Workaround |
|---|---|---|
| No reliable Trailhead progress via MCP | Platform | Skills/certs from user input (Step 1d) |
| Can't confirm who marked an answer "helpful" | Platform | Reactions/thanks as proxy; flag low-confidence |
| Impact often isn't machine-knowable | By design | Prompt user; never fabricate |
| Mentorship is fuzzy to detect | v1 | Propose from repeated coaching threads; user confirms |

## Brag canvas — starting structure

Create once with `slack_create_canvas`, then set `<BRAG_CANVAS_ID>`. Sections: a **Running Tally** table (type · count · notes) plus one table per contribution type (Team Assists, Mentorship, Mock Calls & Shadowing, Sessions & Enablement, Content & Docs Shared, Skills & Certs) with dated rows. Keep the tally at the top — it's what goes in the promotion packet.

## Related

Sibling daily skills: `etrab-weekly-note` (log brag entries alongside weekly notes), `orgcs-case-age` (case metrics = the *other* half). Subagent discipline [`SUBAGENTS.md`](../../SUBAGENTS.md).
