---
name: call-next-steps
description: "After a customer call, capture the user's OWN next steps ('homework') from the Gemini call notes and file each as a due-dated task in the Google Tasks list 'Customer Next Steps' — so their action items stop getting lost in the summaries and resurface in their daily triage. TRIGGER when: the user explicitly asks ONLY for their homework/next steps — 'log my next steps', 'capture my homework', 'what do I owe from this call', 'add my to-dos' — OR when the post-call-360 orchestrator invokes it as its task-writer. DO NOT TRIGGER when: the user pastes customer-call/Gemini notes and asks for a general post-call recap / follow-up / 'the 360' (that's post-call-360, which calls this skill internally); when previewing UPCOMING meetings (that's meeting-summary); or when building the discovery-call prep canvas (that's discovery-call-canvas)."
metadata:
  type: task
  version: "1.0"
  last_updated: "2026-07-14"
  author: "Antonio Magana — Success Guide"
  audience: "Success Guides using Claude Code for post-call follow-up"
---

# Call Next Steps — file YOUR homework into Google Tasks

> ⚙️ **Setup:** replace `<YOUR_WORKSPACE_EMAIL>` (the email your Google Workspace MCP is authenticated as) and `<your timezone>` (IANA, e.g. `America/New_York`). The `Customer Next Steps` list id is resolved (or created) on first run — no placeholder needed.

## Purpose

After a customer call you paste the **Gemini call notes** and generate a customer summary, an AE/CSM summary, and sometimes a next-call canvas. Your **own next steps ("homework") get lost** in that output — there's no single home for them, so you can't see or track them, and you do them at the last minute.

This skill closes that loop: from the same pasted notes it extracts **only the action items you own**, gives each a **due date**, and files them as checkable tasks in one Google Tasks list — **`Customer Next Steps`** — so they show up in your Gmail sidebar, Google Calendar, and every morning's `daily-driver` triage.

> **Scope = your homework only.** Customer-owned and AE/CSM-owned items are *dropped* (they belong in the summaries / the account note, not your to-do list). If nothing is yours, this skill writes nothing.

> **Draft-and-confirm.** You always see the proposed task list before anything is written. The only writes are to Google Tasks (create list / create tasks); nothing goes to Salesforce (a support org's MCP is read-only anyway).

---

## Prerequisites

### Google Workspace MCP connected
The `google-workspace` plugin server must show `✓ Connected` (mailbox `<YOUR_WORKSPACE_EMAIL>`). If it errors "connection reset by peer" / `-32000`, that's the **gateway** — `/mcp reconnect` (NOT re-auth). See [[gworkspace-mcp-gateway-outage]] and [[personal-productivity-skills]]. If Tasks is unreachable, report the gap — don't silently return "nothing to file."

---

## Inputs (all optional — sensible defaults)

| Input | Default | Notes |
|---|---|---|
| **Call notes** | the Gemini notes you paste | if none are pasted, ask for them or the Doc link (`get_doc_as_markdown`) |
| **Account** | inferred from the notes | ask if ambiguous or multiple accounts appear |
| **Call date** | inferred from the notes, else today | anchors relative-date math |
| **Task list** | `Customer Next Steps` | one shared list; created on first run if missing |
| **Default due** | **+2 business days** | used only when the note gives no timeframe |

---

## Step 0 — Guardrails (every run)

1. **Anchor "now" first.** Note the current date/time in your timezone (`<your timezone>`) at the moment the run fires. Convert every relative timeframe in the notes ("by Friday", "next week", "before the next call") to an **absolute date** against that anchor — never leave a task due date relative. See [[feedback-cron-time-anchor]].
2. **Check MCP health before blaming empty results.** If Google errors, `/mcp reconnect` (gateway) and report; don't return a false "no homework."
3. **Draft-and-confirm.** Never create a task without showing you the proposed list first (Step 5).
4. **Sensitive data.** Call notes are real customer content — respect CSG/Claude data-handling; keep task titles/notes concise and free of anything that shouldn't live in Google Tasks.

## Step 1 — Identify account + call date

From the pasted notes, pull the **account/customer name** and the **call date**. If several accounts appear or it's ambiguous, ask which one (don't guess). Use the call date (not today) as the base for any "X days after the call" phrasing.

## Step 2 — Extract ONLY your action items

> **If invoked by `post-call-360`:** the orchestrator already did the single extraction pass and hands it the **pre-split "yours" items + account + call date**. Use those directly — skip re-extraction and go to Step 3 — so your tasks match the customer email / Slack summary instead of diverging. Only extract from the notes yourself when run stand-alone.

Read the notes and list every action item with **who owns it** (mirrors `meeting-followup`'s owner extraction), then **keep only the ones you own** — drop customer-owned and AE/CSM-owned items. For each of yours, apply the `etrab-weekly-note` NEXT STEPS quality bar (its lines 196–202):

- **Concrete, verb-first action** — "Send Acme the security whitepaper", not "follow up with Acme".
- **A target date** (Step 3).
- **The trigger / dependency**, when relevant — what unblocks it or what happens if it slips — captured in the task `notes`.

Reject vague bullets ("follow up", "circle back") — rewrite them into a specific action, or drop them if there's no real commitment. **If no items are yours → tell the user "No homework for you from this call" and write nothing.**

## Step 3 — Due date per item

- If the note states a timeframe, use it (converted to an absolute date per Step 0).
- Otherwise propose the **default: +2 business days** from the call date, and let the user adjust.
- Store as an RFC-3339 date. **Note:** Google Tasks due dates are **date-only** (no time-of-day / alarm) — this is a dated checklist, not a timed reminder.

## Step 4 — Dedupe against what's already there

`list_task_lists` → find `Customer Next Steps` (capture its id). `list_tasks(show_completed=false)` on that list. Skip any proposed item that already exists (same account + same action) so re-processing the same call — or a call you already logged — doesn't create duplicates. Flag skipped dupes in the Step 5 preview so the user knows why they're not listed.

## Step 5 — Present for confirmation (draft-and-confirm)

Show the proposed tasks, tiered by due date, one line each — no writing yet:

```
📋 Homework from <Account> call (<call date>) → list: Customer Next Steps

Due <date>
- <action>  · <dependency/trigger, if any>

Due <date>
- <action>

(Skipped as already-tracked: <action> — due <date>)
```

Wait for the user's OK. Let them edit actions, dates, or drop items before writing.

## Step 6 — On approval, write to Google Tasks

1. If `Customer Next Steps` doesn't exist, create it: `manage_task_list(action="create", title="Customer Next Steps")`. Pin its id to memory ([[call-next-steps-tasklist]]) so future runs skip the lookup.
2. For each approved item: `manage_task(action="create", task_list_id=<id>, title=<action>, notes=<Account · call date · dependency/context · optional summary-doc or canvas link>, due=<RFC-3339 date>)`.
3. Keep `title` short and scannable (it's what shows in the Tasks UI / Gmail sidebar); put the context in `notes`.

## Step 7 — Report where they went

Confirm what was filed and where it will surface:

> ✅ Filed **N** tasks to your **Customer Next Steps** list — they'll show in your Gmail sidebar, Google Calendar, and tomorrow's `daily-driver`. (M already-tracked items skipped.)

**Optional, off by default:** if an item is high-effort, offer to also drop a **Google Calendar time-block** (`manage_event`) so it can't slip to the last minute — only on explicit request.

---

## Output Standards
- **Your homework only** — customer/AE items belong in the summaries, not this list.
- **Every task has an absolute due date** — never a relative phrase.
- **Draft-and-confirm** before any write; dedupe before creating.
- One shared list (`Customer Next Steps`) so you always know where your homework lives.
- Report any MCP gap (Google gateway) rather than a false "nothing to file."
- Respect CSG/Claude data-handling for customer content in titles/notes.

## Known Limitations
| Limitation | Status | Workaround |
|---|---|---|
| Google Tasks due dates are **date-only** | Platform | It's a dated checklist; add a Calendar time-block (Step 7) if a timed nudge is needed |
| No native reminder/alarm on a task | Platform | `daily-driver` surfaces due/overdue each morning; optional Calendar block for alerts |
| Can't write tasks to Salesforce/OrgCS | Support-org MCP is read-only ([[orgcs-mcp-readonly]]) | Personal homework lives in Google Tasks; engagement next steps stay in `etrab-weekly-note` |
| Owner attribution depends on the notes | Observed | When ownership is unclear, ask rather than assume it's yours |

## Related
The **task-writer component of [[post-call-360]]** (the full post-call front door), which hands over the pre-extracted "yours" items; also runs stand-alone for a homework-only ask. Pairs with `discovery-call-canvas`. Extraction pattern from `meeting-followup`; next-steps quality bar + draft-and-confirm from [[etrab-weekly-note]] and `brag-book`. Surfaced daily by [[daily-driver]] (Google Tasks lane). List id pinned in [[call-next-steps-tasklist]]. Personal-productivity family: [[personal-productivity-skills]].
