---
name: daily-driver
description: "On-demand 'bring me up to speed' orchestrator for a Success Guide's daily work — routes across Gmail priority, calendar agenda, OrgCS case age, and engagement nudges, then hands back one synthesized picture of what needs attention today. TRIGGER when: user says 'catch me up', 'what needs my attention today', 'morning check', 'where do I stand', or asks for a combined view of mail + calendar + cases + engagements. DO NOT TRIGGER when: the user named a single skill (invoke that directly), or wants the unattended twice-daily digest (that's the cron, not this)."
metadata:
  type: orchestrator
  version: "1.0"
  last_updated: "2026-07-08"
  author: "Antonio Magana — Success Guide"
  audience: "Success Guides using Claude Code for daily triage"
  companion_cron: "TWICE-DAILY DIGEST (weekdays, morning & midday, in <your timezone>)"
---

# Daily Driver — "Catch me up" orchestrator

## Purpose

The **interactive front door for a Success Guide's daily triage.** When you ask *"catch me up"* / *"what needs my attention today,"* this routes across the personal-productivity skills, runs each the right way, and hands back **one synthesized picture** — what's urgent, what's waiting on you, what's on the calendar — instead of four separate reports.

It's the **on-demand twin of the twice-daily digest cron** (which runs the same skills unattended, weekdays 7:04 AM & 12:04 PM, and DMs the result). Use this skill when *you* want the picture now; the cron handles the scheduled runs. This skill **routes and synthesizes — it does not re-implement** the task skills.

> **Read-only by default.** Every skill it calls is read-only or draft-and-confirm. The only outbound actions are (a) Slack nudges via `/orgcs-engagement-nudge`, which stay **draft-and-confirm** in interactive mode, and (b) an optional summary DM if you ask for one. Nothing is written to Salesforce.

---

## The daily-triage skills it routes across

| Skill | Answers | Source | Write? |
|---|---|---|---|
| `/gmail-priority-check` | "What email actually needs me?" | Gmail (personal) | ❌ read-only |
| `/calendar-agenda` | "What meetings do I have?" | Google Calendar | ❌ read-only |
| `/orgcs-case-age` | "Which cases has the customer gone quiet on?" | OrgCS (real, RO) | ❌ detect + alert |
| `/orgcs-engagement-nudge` | "Which engagements are waiting on a nudge?" | OrgCS + Slack | ⚠️ draft-and-confirm nudge |
| `/etrab-weekly-note` NEXT STEPS | "What did I commit to on each engagement?" | OrgCS + Slack + Gmail | ❌ read-only (parse only) |

---

## Step 0 — Guardrails (apply to every run)

1. **Anchor "now" first.** Call `getUserInfo` (OrgCS) *and* note the current time in the user's timezone (`<your timezone>`) at the moment the run fires. Classify every timestamp (email, event, case, Slack) as past / now / upcoming against that anchor — never against a scheduled slot. See [[feedback-cron-time-anchor]].
2. **Read-only + least outbound.** OrgCS/Gmail/Calendar are read-only here. The only interactive write is an **approved** engagement nudge — draft-and-confirm, never auto-send (auto-send is a cron-only guardrailed behavior).
3. **Sensitive data.** OrgCS case + engagement content is real customer/support data — respect CSG/Claude data-handling before putting any of it anywhere external.
4. **Check MCP health before blaming empty results.** If OrgCS 401s → re-auth at `/mcp` (orgcs custom domain). If Google errors "connection reset by peer" → `/mcp reconnect` (gateway, not re-auth — [[gworkspace-mcp-gateway-outage]]). Report the gap; don't silently return "all clear."
5. **Slack is a delivery target, not a reply channel.** A DM reply can't reach Claude ([[twice-daily-digest-cron]]).

---

## Step 1 — Scope the run

Default = **all four lanes** (mail, calendar, cases, engagements). Narrow when the user asks ("just my cases", "only calendar for today"). Pick the window: default mail = 3 days, calendar = today + 7, case/engagement thresholds = each skill's default (2 business days).

## Step 2 — Run the lanes (inline by default; fan out only if big-and-parallel)

**This is the subagent-discipline decision — the whole reason this orchestrator exists.** See [[feedback-subagent-discipline]].

**Default: run inline, sequentially.** For a normal interactive "catch me up," the four lanes are each fast (a couple of tool calls) and you're present watching. Inline is faster *and* cheaper than spawning four subagents — do that. Bulk-query inside each lane (e.g. case-age fetches all cases' email in one `IN(ids)` query); never loop a subagent per case or per engagement.

**Fan out ONLY when a lane is genuinely big-and-parallel:**
- **Engagements > 3** — the engagement lane (nudge + NEXT STEPS parse) reads a Slack channel + email per engagement. With more than 3, fan out **one subagent per engagement** (each returns just its verdict/next-step, not the raw channel dump), spawned in one message. **≤ 3 → inline.** This mirrors `/etrab-weekly-note` and `/orgcs-engagement-nudge` cron gates.
- **A single lane you were asked to go deep on** (e.g. "audit every engagement's full history") — offload that lane to one subagent so its noisy reads stay out of the main thread; keep the other lanes inline.

**Never fan out** the mail lane or the calendar lane (single-source, short) — they're textbook inline. And **never fan out during a live call** — if the user is on a customer call, run only what they ask, narrated, sequential.

## Step 3 — Synthesize ONE picture (always inline)

Synthesis needs every lane's result together, so it is **not** parallelizable — do it once, in the main thread. Reconcile across lanes so the same item isn't double-counted and the freshest signal wins (e.g. a calendar invite that resolves an engagement's "waiting on customer" nudge; an email reply that closes a case's silence clock). See [[feedback-digest-synthesis-reconciliation]] and [[feedback-slack-channel-overrides-weekly-note]].

Present tiered, urgent-first:

```
☀️ Daily driver — as of <date/time, user TZ>

🔴 Needs you today
- <item> · <lane> · <one-line why + what to do>
...

🟡 On your radar
- <item> · <lane> · <one line>
...

📅 Today's calendar
- <time> <meeting> · <join/RSVP flag>
...

✍️ Drafts ready (if any nudges/replies were drafted — awaiting your OK)
```

## Step 4 — Optional delivery

If the user asks, DM the summary to their Slack (`channel_id` = their user_id). Wrap links as `<url|label>`, `*single-asterisk*` bold, no bare URLs (avoids `invalid_blocks`). Otherwise just present in the terminal. Any drafted nudge stays a draft until the user explicitly approves.

---

## Output Standards

- **One synthesized picture, not four stitched reports.** Reconcile across lanes; the freshest live signal wins.
- **Inline by default; fan out only when big-and-parallel (engagements > 3 or a deep-dive lane); never during a live call.** State it if you fan out ("3+ engagements — fanned out per-engagement reads").
- Always state the as-of time, timezone, and windows/thresholds used.
- Read-only; the sole interactive write is an approved nudge (draft-and-confirm).
- Report any MCP gap (auth/gateway) rather than returning a false "all clear."

## Known Limitations

| Limitation | Status | Workaround |
|---|---|---|
| Orchestrator doesn't do the lane work | By design | Delegates to the five task skills; synthesizes |
| Interactive nudge needs approval | By design | Draft-and-confirm; auto-send is cron-only ([[orgcs-engagement-nudge]]) |
| Slack DM reply can't reach Claude | Platform | Deliver-only; act in the source UI |
| OrgCS / Google auth can drop mid-run | Platform | Re-auth `/mcp` (orgcs) or `/mcp reconnect` (Google gateway) |

## Related

Task skills `/gmail-priority-check` · `/calendar-agenda` · `/orgcs-case-age` · `/orgcs-engagement-nudge` · `/etrab-weekly-note`. Unattended twin = the twice-daily digest cron ([[twice-daily-digest-cron]]). Subagent discipline [[feedback-subagent-discipline]]. Sibling top-level router for Salesforce work = [[salesforce-tool-router-skill]].
