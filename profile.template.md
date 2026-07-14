# My Profile — Claude Code context for sf-skills

<!--
  WHAT THIS IS
  The skills in this repo are the CAPABILITY layer (what Claude can do).
  This file is the CONTEXT layer (who you are + where your work lives).
  Fill it once and every skill knows your email, timezone, Slack id, and org —
  no more editing individual SKILL.md files.

  HOW TO USE
  1. Copy this file to  ~/.claude/profile.md
  2. Either run  /setup-profile  (Claude auto-detects most of these for you and
     asks you to confirm) OR fill the values below by hand.
  3. NEVER commit your filled ~/.claude/profile.md — it identifies you.
     (The repo ships only this blank template.)

  Format: `key: value`, one per line. Leave a value blank if you don't have it;
  skills fall back to auto-detecting at runtime.
-->

## Identity
- name:                    # your display name, e.g. "Jane Doe"
- role:                    # e.g. "Success Guide, Agentforce Service"
- workspace_email:         # Google Workspace / Gmail / Calendar account, e.g. jane@salesforce.com
- timezone:                # IANA name, e.g. America/Mexico_City  (NOT "CST")
- slack_user_id:           # e.g. U01ABC23DEF — where digests & alerts get DM'd

## Salesforce / OrgCS
- orgcs_username:          # your support-org login, ends in @orgcs.com

## Optional references
- field_guide_canvas_url:  # companion "MCP vs CLI vs Skills" canvas (salesforce-tool-router)
- weekly_note_canvas_url:  # your ETRAB weekly-note template canvas (etrab-weekly-note)

---

## Field reference — what reads each value

| Field | Skills that use it | How `/setup-profile` detects it |
|---|---|---|
| `workspace_email` | gmail-priority-check, calendar-agenda, discovery-call-canvas, etrab-weekly-note | Google Workspace MCP is already authed — read `primary` from `list_calendars` |
| `timezone` | daily-driver, calendar-agenda, orgcs-case-age, orgcs-engagement-nudge, etrab-weekly-note | OrgCS `getUserInfo` → `userTimeAndLocale.timeZoneIana` |
| `slack_user_id` | daily-driver, orgcs-case-age, orgcs-engagement-nudge | `slack_search_users` by your name / email |
| `orgcs_username` | orgcs-case-age, orgcs-engagement-nudge, etrab-weekly-note | OrgCS `getUserInfo` → `username` (confirm it ends `@orgcs.com`) |
| `field_guide_canvas_url` | salesforce-tool-router | you provide (a reference link) |
| `weekly_note_canvas_url` | etrab-weekly-note | you provide (a reference link) |

> Every required value is auto-detectable from an MCP you've already connected —
> which is why `/setup-profile` can fill this for you and you just confirm.
