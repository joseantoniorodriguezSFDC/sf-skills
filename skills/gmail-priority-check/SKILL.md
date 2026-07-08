---
name: gmail-priority-check
description: Scan the user's Gmail for email that actually needs attention — messages sent directly TO them (not cc/bcc/list blasts) and messages that read as imperative (urgent, deadline, action-requested, a direct question). Ranks them into "Needs your attention" vs "FYI" with a one-line reason each. Read-only — it never sends, replies, archives, or labels without explicit approval.
---

> **⚙️ Setup:** Replace `<YOUR_WORKSPACE_EMAIL>` (and any `<PLACEHOLDER>`) with your own before first use.

# Gmail Priority Check — What actually needs my attention

## Purpose

Cut the inbox down to what matters: **"Which recent emails were sent directly to me, or sound like they need action from me?"**

The skill runs a few targeted Gmail searches, pulls the messages, scores each on **directness** (am I a real To: recipient?) and **imperativeness** (urgent / deadline / action-requested / a question aimed at me), and presents a ranked list with a one-line "why" per item. It is **read-only** by default.

> The Google Workspace MCP is already authenticated to **<YOUR_WORKSPACE_EMAIL>** — no email argument is needed. Do not send, reply, archive, delete, or relabel anything unless the user explicitly asks, and confirm first (outward-facing / hard-to-reverse).

---

## Prerequisites

Confirm the Google Workspace MCP is connected (`claude mcp list` → the `google-workspace` server, or just call `list_calendars`/a Gmail search and check it returns the user's address). If it errors with an auth failure, tell the user to re-authenticate the Google Workspace MCP at `/mcp` and stop.

---

## Inputs (all optional — sensible defaults)

| Input | Default | Notes |
|---|---|---|
| **Window** | last 3 days (`newer_than:3d`) | widen to 7d for the imperative sweep; tunable |
| **Read state** | unread + read both, but flag unread | the user often wants unread-only — honor "just unread" → add `is:unread` |
| **Scope** | `in:inbox`, exclude `from:me` | ignore Sent; optionally include other folders if asked |
| **Account** | the authenticated account (primary) | `<YOUR_WORKSPACE_EMAIL>` |

---

## Step 1 — Run targeted searches (`search_gmail_messages`)

Run these as separate queries and union the Message IDs (dedupe). Adjust `page_size` ~15–25.

1. **Directly to me, recent:**
   `to:me -from:me in:inbox newer_than:3d`
2. **Imperative / action language (wider window):**
   `in:inbox -from:me newer_than:7d (urgent OR asap OR "action required" OR "action needed" OR deadline OR "by EOD" OR "by end of day" OR "please review" OR "please confirm" OR "follow up" OR approval OR "sign off" OR blocker OR escalation OR reminder OR "needs your")`
3. **Gmail's own importance / starred:**
   `in:inbox -from:me newer_than:3d (is:important OR is:starred)`

> Gmail search operators only — keep queries simple; don't over-engineer the regex. If the user names a sender/topic, add `from:` / keyword filters.

## Step 2 — Pull content

`get_gmail_messages_content_batch` (max 25 IDs/batch) with `format: "full"` for the deduped set. Capture: From, To, Cc, Subject, Date, and the opening body lines.

## Step 3 — Score each message

Mark two independent signals:

- **Direct to me** — my address is in **To** (not only Cc/Bcc), and To is **not** a large distribution list / alias blast. A message addressed personally to me ranks higher than one where I'm one of many.
- **Imperative** — body/subject contains an explicit ask, deadline, or a **question directed at me** ("can you…", "could you…", "please…", "?"), OR carries Gmail's IMPORTANT flag. De-prioritize obvious automation: `no-reply@`, `notifications@`, newsletters, digests, calendar-invite auto-mails (note these separately).

**Priority:**
- 🔴 **Needs attention** — direct-to-me **and** imperative (or unread + clear deadline).
- 🟡 **Worth a look** — one signal (direct OR imperative).
- ⚪ **FYI** — neither strong; cc/list/automated.

## Step 4 — Present

Lead with a ranked table; newest/most-urgent first:

```
Gmail priority — as of <date/time, user TZ> · window: <3d/7d>
┌──────────┬──────────────────────┬─────────────────────────────┬───────────────────────┬──────────┬──────┐
│ Priority │ From                 │ Subject                     │ Why it matters        │ Received │ Unread│
├──────────┼──────────────────────┼─────────────────────────────┼───────────────────────┼──────────┼──────┤
│ 🔴       │ …                    │ …                           │ direct + "by EOD"     │ …        │ yes  │
└──────────┴──────────────────────┴─────────────────────────────┴───────────────────────┴──────────┴──────┘
```

- Give each 🔴/🟡 a one-line "why" (direct-to-me / deadline / question / IMPORTANT flag) and a clickable Gmail link.
- Summarize the ⚪ FYI bucket in one line (counts: lists, notifications, newsletters) rather than listing all.
- If nothing qualifies: "No priority email in the last <N> days — inbox is calm."

---

## Output Standards

- **Run inline — never fan out.** This is a single-source, short, sequential skill (a few Gmail searches → one batched content pull → score → present). A subagent would be slower and cost more with nothing to parallelize. It's a textbook *keep-it-inline* case. See [[feedback-subagent-discipline]].
- Lead with 🔴 items; never dump raw JSON.
- Always state the as-of time, timezone, and window used.
- **Read-only.** If the user then asks to reply/draft/archive/label, draft it and confirm before any send or change — sending email is outward-facing and not reversible.
- Respect CSG/Claude data-handling guidelines before quoting email content anywhere external.

## Known Limitations

| Limitation | Status | Workaround |
|---|---|---|
| "Important" is heuristic | By design | Combines direct-to-me + action language + Gmail IMPORTANT; tune keywords |
| `to:me` can include alias/list mail | Gmail | Check the actual To header in Step 3; demote big lists |
| Threads vs messages | v1 | Scores latest message; open the thread for full context |
| Snooze / other inboxes not scanned | v1 | Defaults to `in:inbox`; widen scope on request |
