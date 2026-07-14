---
name: setup-profile
description: One-time setup for the sf-skills toolkit. Detects the user's context (workspace email, timezone, Slack user id, OrgCS org) from the MCPs they've already connected, confirms each value with them, offers to create the brag/weekly Slack canvases they don't have yet, and writes ~/.claude/profile.md — the single file every other skill reads for who-you-are context. Run this once after cloning the repo; run again anytime a value changes. Read-only except for writing the profile file and (only on your yes) creating those canvases.
metadata:
  author: "Jose Antonio Rodriguez — Success Guide"
---

# Setup Profile — make the toolkit yours in one step

## Purpose

Every skill in this repo needs a little context about **you**: which mailbox to
read, what timezone to reckon dates in, where to DM your digest, which support org
you're in. Rather than hand-editing each `SKILL.md`, that context lives in **one
file — `~/.claude/profile.md`** — and every skill reads it.

This skill **fills that file for you**: it detects each value from an MCP you've
already connected, shows you what it found, and writes the profile only after you
confirm. It is the Claude-native replacement for a setup script — a bash script
can't reach your MCPs; this can.

> **Run this once** after `git clone`. Re-run anytime something changes (new
> timezone, new Slack workspace). It writes `~/.claude/profile.md`, and — only if
> you say yes — creates the brag/weekly Slack canvases you don't have yet (Step 2.5).
> Nothing else, nothing else outward-facing.

---

## Prerequisites

Best results if these are connected (`claude mcp list`), but each is optional —
skip any that's missing and leave that field blank:

- **`orgcs`** (or your support org) — for timezone + OrgCS username.
- **`google-workspace`** — for your workspace email.
- **`slack`** — for your Slack user id.

---

## Step 1 — Detect what we can

Run these read-only lookups and collect the results. Do **not** ask the user for
anything you can detect yourself.

| Field | How to detect |
|---|---|
| `workspace_email` | Call `list_calendars`; the `primary` calendar id **is** the authed email. (Google MCP is already authenticated — no argument needed.) |
| `timezone` | Call `getUserInfo` on `orgcs` → read `userTimeAndLocale.timeZoneIana` (an IANA name like `America/Mexico_City`). |
| `orgcs_username` | Same `getUserInfo` → `username`. Confirm it ends in `@orgcs.com`. |
| `slack_user_id` | Call `slack_search_users` with the person's name or `workspace_email`; take the matching member's `id` (`U…`). If several match, show the candidates and ask. |

For anything that errors or is missing, note it and move on — don't block.

## Step 2 — Show findings and confirm

Present a compact table: **field · detected value · source**. Ask the user to
confirm or correct each. Explicitly ask for the optional references (they
can't be detected):

- `booking_link` — their self-service scheduling URL (inlined into customer email drafts + AE kickoffs).
- `guide_channel_id` — the team guide channel they share content in (a channel id).
- `field_guide_canvas_url` — their "MCP vs CLI vs Skills" companion canvas, if any.
- `brag_canvas_url` / `weekly_note_canvas_url` — Slack canvases they **own**. Most new
  users won't have these yet — don't just leave them blank; go to Step 2.5.

Let them leave any field blank.

## Step 2.5 — Offer to create the canvases they're missing

`brag_canvas_url` (for `brag-book`) and `weekly_note_canvas_url` (for `etrab-weekly-note`)
point at Slack canvases the user owns — and a fresh user has neither. For each one they
don't already have, **offer to create it** (only on their yes) via `slack_create_canvas`,
then use the returned URL as the field value:

- **Brag book** — title it e.g. *My Brag Book*. Seed the structure from
  [`brag-book`](../brag-book/SKILL.md): a **Running Tally** table at the top
  (type · count · notes) plus one empty table per contribution type (Team Assists,
  Mentorship, Mock Calls & Shadowing, Sessions & Enablement, Content & Docs Shared,
  Skills & Certs). Honor that skill's canvas-markdown rules (no `####`+, `![](@U…)`
  for users, `![](#C…)` for channels).
- **ETRAB weekly** — title *ETRAB Weekly — Actionable Items & Stage Recommendations*.
  Seed a timestamped header, a placeholder per-engagement section, and a Stage-flip
  table (structure per [`etrab-weekly-note`](../etrab-weekly-note/SKILL.md) Step 8.5).

If Slack isn't connected, or they'd rather build it by hand, leave the field blank and
point them at [`SETUP.md`](../../SETUP.md) §4. **Never create a canvas without confirmation.**

## Step 3 — Write the profile

Write `~/.claude/profile.md` using the exact `key: value` format from
`profile.template.md` (Identity → Salesforce/OrgCS → Optional references). Preserve
the section headers so other skills can parse it. If the file already exists, show
a before/after diff and confirm before overwriting.

## Step 4 — Confirm and point them onward

Report the path written and remind them:

- **Never commit `~/.claude/profile.md`** — it identifies you. The repo ships only
  the blank `profile.template.md`.
- They're set — every skill now reads this. Suggest a first run: `catch me up`
  (`/daily-driver`).

---

## How skills consume the profile

Other skills read `~/.claude/profile.md` for the values above. If the file is
missing or a field is blank, they fall back to detecting at runtime (the same
lookups in Step 1) and should suggest running `/setup-profile` to make it durable.

## Guardrails

- **Read-only except the profile — and one opt-in canvas.** Writes
  `~/.claude/profile.md`, and only on an explicit yes creates a brag/weekly Slack
  canvas (Step 2.5). Never touches skill files, never posts to a channel or DMs anyone.
- **Detect, don't interrogate.** Ask only for what genuinely can't be detected
  (the optional links, the canvases) or for confirmation of a detected value.
- **Never store secrets.** Emails, ids, and timezone only — no tokens, no
  passwords. OAuth secrets live in `~/.claude.json` and are out of scope here.
