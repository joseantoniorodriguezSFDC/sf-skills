---
name: calendar-agenda
description: Show the user's upcoming meetings from Google Calendar — today and the days ahead — with times, attendees, location/join link, and their RSVP status. Flags conflicts/overlaps, back-to-backs, and meetings they haven't responded to. Read-only — it never creates, edits, or RSVPs to events without explicit approval.
---

> **⚙️ Setup:** Replace `<YOUR_WORKSPACE_EMAIL>` and `<your timezone>` with your own before first use.

# Calendar Agenda — What meetings do I have?

## Purpose

Answer "**What's on my calendar?**" fast: today's meetings first, then the days ahead — each with time, who's invited, where/how to join, and whether the user has RSVP'd. Surfaces **conflicts**, **back-to-backs**, and **un-answered invites** so nothing slips. Read-only by default.

> The Google Workspace MCP is already authenticated to **<YOUR_WORKSPACE_EMAIL>**. Do not create, edit, delete, or RSVP to events unless the user explicitly asks, and confirm first.

---

## Prerequisites

Confirm the Google Workspace MCP is connected (call `list_calendars` — it should return the user's calendars). If it errors with an auth failure, tell the user to re-authenticate at `/mcp` and stop.

---

## Inputs (all optional — sensible defaults)

| Input | Default | Notes |
|---|---|---|
| **Window** | today + next 7 days | "today" / "tomorrow" / "this week" / "next week" → adjust `time_min`/`time_max` |
| **Calendar(s)** | `primary` | the user also has shared calendars (e.g. team OOO, Assembled); include others only if asked |
| **Timezone** | the user's tz (<your timezone>) | render all times in the user's local tz |
| **Detail** | attendees + location + link | `detailed: true` |

---

## Step 1 — Resolve calendars & window

- `list_calendars` to confirm `primary` (= `<YOUR_WORKSPACE_EMAIL>`). Use other calendars only if the user names them.
- Compute `time_min`/`time_max` in RFC3339 for the requested window. Default `time_min` = start of today (user tz), `time_max` = end of today + 7 days. For "today" use start→end of today; "tomorrow" the next day; etc.

## Step 2 — Pull events

`get_events` on `primary` with `time_min`, `time_max`, `detailed: true`, a generous `max_results` (~50). Use `include_attachments: true` only if the user wants attached docs. Capture per event: summary, start/end, attendees (+ the user's own `responseStatus`), organizer, location, video/join link, and whether it's all-day.

> To find a specific meeting, pass `query` (keyword) or, for one event, `event_id`.

## Step 3 — Analyze

- **Group by day**; within a day, sort by start time. Render in the user's timezone.
- **RSVP status** — flag events where the user is `needsAction` (hasn't responded) or `tentative`.
- **Conflicts** — flag overlapping events (two meetings at the same time).
- **Back-to-backs** — note when meetings touch with no gap (no break).
- Separate **all-day / OOO** entries from timed meetings.
- Skip declined events by default (mention the count).

## Step 4 — Present

```
Agenda — <window>, times in <user TZ> (as of <now>)

📅 Today (Wed, Jun 3)
  • 10:00–10:30  <Title>           <attendees count> · <join/location> · RSVP: ✅/❓/—
  • 11:00–12:00  <Title>           …                                    ⚠️ overlaps next
  ⚠️ 11:30–12:00 <Title>           …
📅 Thu, Jun 4
  • 13:30–14:30  <Account> session   …
…
```

- Lead with **today**. Then each upcoming day with events.
- Call out at the top: count of meetings today, any **conflicts**, and any **un-RSVP'd** invites needing a response.
- Include the join link (Meet/Zoom) or location inline so it's one click.
- If the window is empty: "No meetings <window> — you're clear."

---

## Output Standards

- **Run inline — never fan out.** One `get_events` call → analyze → present. There's nothing to parallelize; a subagent only adds latency and tokens. Textbook *keep-it-inline*. See [[feedback-subagent-discipline]].
- Lead with today's agenda; never dump raw JSON.
- Always state the window, timezone, and as-of time.
- **Read-only.** If the user asks to create/move/RSVP, confirm the details and only then call the write tool (`manage_event`) — calendar changes notify other attendees.
- Cross-link: meetings tied to engagements pair well with [[etrab-engagement-skill]] (`/orgcs-engagement-nudge`) and the [[orgcs-case-age]] triage.

## Known Limitations

| Limitation | Status | Workaround |
|---|---|---|
| Only `primary` by default | By design | Name a shared calendar to include it |
| Recurring events | v1 | `get_events` expands instances in-window; very long series may truncate at `max_results` |
| Timezone rendering | Important | Always convert to the user's tz; events may be stored in UTC/other tz |
| Free/busy of others | Out of scope | Use `query_freebusy` separately if scheduling across people |
